import "server-only";

export type ModelTier = "quality" | "standard" | "light";

/** Model per cost tier. Each can be overridden; see README "AI models and cost". */
export const DEFAULT_MODELS: Record<ModelTier, string> = {
  quality: "claude-opus-5-5",
  standard: "claude-sonnet-5-5",
  light: "claude-haiku-5-5",
};

export function getAnthropicConfig(): { apiKey: string; models: Record<ModelTier, string> } | null {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  return {
    apiKey,
    models: {
      quality: process.env.ANTHROPIC_MODEL || DEFAULT_MODELS.quality,
      standard: process.env.ANTHROPIC_MODEL_STANDARD || DEFAULT_MODELS.standard,
      light: process.env.ANTHROPIC_MODEL_LIGHT || DEFAULT_MODELS.light,
    },
  };
}

export function getAiRateLimitPerHour(): number {
  const raw = Number(process.env.AI_RATE_LIMIT_PER_HOUR);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 40;
}

/**
 * Deterministic AI fixtures for automated end-to-end tests. Only honoured outside production
 * builds, so a misconfigured deployment can never serve simulated AI output.
 */
export function isAiMockMode(): boolean {
  return process.env.AI_MOCK_RESPONSES === "1" && process.env.NODE_ENV !== "production";
}
