import "server-only";
import type { z } from "zod";
import { NextResponse } from "next/server";
import { AiError, callStructured, configuredModel, isAiConfigured } from "@/lib/ai/client";
import { beginJob, completeJob, failJob, type BeginJob } from "@/lib/ai/guard";
import { jsonError } from "@/lib/api";
import type { ServerSupabase } from "@/lib/supabase/server";

export interface AiRun<T, R> {
  supabase: ServerSupabase;
  job: Omit<BeginJob, "model" | "prompt">;
  prompt: { system: string; user: string };
  operation: string;
  validator: z.ZodType<T>;
  effort: "low" | "medium" | "high";
  maxTokens: number;
  signal?: AbortSignal;
  /**
   * Turns validated model output into the response payload and persists anything derived from it.
   * The job is only marked succeeded after this resolves, so a failed save is never reported as success.
   */
  finish: (data: T, ctx: { jobId: string; model: string }) => Promise<R>;
}

/** Shared guard rails for every AI operation. Returns a JSON response. */
export async function runAi<T, R extends Record<string, unknown>>(run: AiRun<T, R>): Promise<NextResponse> {
  if (!isAiConfigured()) {
    return jsonError(503, "AI features are not configured on this server. Add ANTHROPIC_API_KEY to enable them.", { code: "unavailable" });
  }
  const { data: profile } = await run.supabase.from("profiles").select("ai_enabled").maybeSingle<{ ai_enabled: boolean }>();
  if (profile && !profile.ai_enabled) {
    return jsonError(403, "AI features are switched off in your settings.", { code: "ai_disabled" });
  }

  const begin = await beginJob(run.supabase, { ...run.job, model: configuredModel() ?? "unknown", prompt: run.prompt });
  if (begin.kind === "rejected") return jsonError(begin.status, begin.error, { code: begin.status === 429 ? "rate_limited" : "conflict" });
  if (begin.kind === "replay") return NextResponse.json({ ok: true, jobId: begin.job.id, replay: true, ...(begin.job.output as R) });

  try {
    const result = await callStructured({
      operation: run.operation,
      system: run.prompt.system,
      user: run.prompt.user,
      validator: run.validator,
      effort: run.effort,
      maxTokens: run.maxTokens,
      signal: run.signal,
    });
    const payload = await run.finish(result.data, { jobId: begin.id, model: result.model });
    await completeJob(run.supabase, begin.id, { model: result.model, usage: result.usage, stopReason: result.stopReason, output: payload });
    return NextResponse.json({ ok: true, jobId: begin.id, model: result.model, ...payload });
  } catch (error) {
    if (error instanceof AiError) {
      await failJob(run.supabase, begin.id, error.message, error.code === "cancelled");
      const status = error.code === "rate_limited" ? 429 : error.code === "unavailable" ? 503 : error.code === "cancelled" ? 499 : 502;
      return jsonError(status, error.message, { code: error.code, retryable: error.retryable });
    }
    // Never log prompts or outputs: they contain personal data.
    console.error("[ai]", run.operation, error instanceof Error ? error.message : "unknown error");
    await failJob(run.supabase, begin.id, "Unexpected error");
    return jsonError(500, "Something went wrong while processing the AI result. Nothing was changed.", { retryable: true });
  }
}
