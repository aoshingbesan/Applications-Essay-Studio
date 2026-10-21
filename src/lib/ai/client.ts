import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { z } from "zod";
import { getAnthropicConfig, isAiMockMode } from "@/lib/env.server";
import { toOutputSchema } from "./schemas";
import { mockOutput } from "./mock";

export class AiError extends Error {
  constructor(
    message: string,
    readonly code: "unavailable" | "auth" | "rate_limited" | "provider" | "refused" | "truncated" | "invalid_output" | "cancelled",
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "AiError";
  }
}

// Models that accept the server-side refusal fallback ("default" routing).
const FALLBACK_MODELS = new Set(["claude-opus-5-5", "claude-opus-5", "claude-fable-5-1", "claude-sonnet-5-5"]);

export interface StructuredCall<T> {
  /** Operation name; used for logs and for test fixtures. */
  operation: string;
  system: string;
  user: string;
  validator: z.ZodType<T>;
  effort: "low" | "medium" | "high";
  maxTokens: number;
  signal?: AbortSignal;
}

export interface StructuredResult<T> {
  data: T;
  model: string;
  stopReason: string | null;
  usage: { input_tokens: number; output_tokens: number };
}

export function isAiConfigured(): boolean {
  return isAiMockMode() || getAnthropicConfig() !== null;
}

export function configuredModel(): string | null {
  if (isAiMockMode()) return "mock";
  return getAnthropicConfig()?.model ?? null;
}

/** Validates parsed model output; malformed output is a retryable failure, never saved. */
export function validateOutput<T>(validator: z.ZodType<T>, text: string): T {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new AiError("The AI response was not in the expected format. Please try again.", "invalid_output", true);
  }
  const parsed = validator.safeParse(json);
  if (!parsed.success) {
    throw new AiError("The AI response was missing required parts. Please try again.", "invalid_output", true);
  }
  return parsed.data;
}

/** Calls Claude with a JSON schema output format and validates the result. Server-only. */
export async function callStructured<T>(call: StructuredCall<T>): Promise<StructuredResult<T>> {
  if (isAiMockMode()) {
    // Test mode only (refused in production builds): deterministic fixtures, validated like real output.
    const data = validateOutput(call.validator, JSON.stringify(mockOutput(call.operation, call.user)));
    return { data, model: "mock", stopReason: "end_turn", usage: { input_tokens: 0, output_tokens: 0 } };
  }

  const config = getAnthropicConfig();
  if (!config) throw new AiError("AI features are not configured. Add ANTHROPIC_API_KEY to the server environment.", "unavailable", false);

  const client = new Anthropic({ apiKey: config.apiKey, maxRetries: 2, timeout: 280_000 });
  const useFallback = FALLBACK_MODELS.has(config.model);

  let message: Anthropic.Beta.BetaMessage;
  try {
    const stream = client.beta.messages.stream(
      {
        model: config.model,
        max_tokens: call.maxTokens,
        ...(useFallback ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
        output_config: { effort: call.effort, format: { type: "json_schema", schema: toOutputSchema(call.validator) } },
        system: call.system,
        messages: [{ role: "user", content: call.user }],
      },
      { signal: call.signal },
    );
    message = await stream.finalMessage();
  } catch (error) {
    if (error instanceof Anthropic.APIUserAbortError || call.signal?.aborted) {
      throw new AiError("The request was cancelled.", "cancelled", false);
    }
    if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
      throw new AiError("The AI service rejected the API key. Check ANTHROPIC_API_KEY.", "auth", false);
    }
    if (error instanceof Anthropic.RateLimitError) {
      throw new AiError("The AI service is rate limiting requests. Please wait a minute and try again.", "rate_limited", true);
    }
    if (error instanceof Anthropic.BadRequestError) {
      throw new AiError("The AI service could not process this request.", "provider", false);
    }
    if (error instanceof Anthropic.APIConnectionTimeoutError) {
      throw new AiError("The AI service took too long to respond. Please try again.", "provider", true);
    }
    if (error instanceof Anthropic.APIConnectionError) {
      throw new AiError("Could not reach the AI service. Check your connection and try again.", "provider", true);
    }
    if (error instanceof Anthropic.APIError) {
      throw new AiError("The AI service is temporarily unavailable. Please try again.", "provider", true);
    }
    throw error;
  }

  if (message.stop_reason === "refusal") {
    throw new AiError("The AI model declined this request. Try rephrasing your instruction.", "refused", false);
  }
  if (message.stop_reason === "max_tokens") {
    throw new AiError("The response was cut off before it finished. Try a shorter request.", "truncated", true);
  }

  const text = message.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
  return {
    data: validateOutput(call.validator, text),
    model: message.model,
    stopReason: message.stop_reason,
    usage: { input_tokens: message.usage.input_tokens, output_tokens: message.usage.output_tokens },
  };
}
