import "server-only";
import { createHash } from "node:crypto";
import type { ServerSupabase } from "@/lib/supabase/server";
import { getAiRateLimitPerHour } from "@/lib/env.server";
import type { AiJob, AiJobKind, SourceRefs } from "@/lib/domain/types";

export interface BeginJob {
  kind: AiJobKind;
  action?: string | null;
  essayId?: string | null;
  exemplarId?: string | null;
  applicationId?: string | null;
  idempotencyKey: string;
  model: string;
  promptVersion: string;
  settings?: Record<string, unknown>;
  sourceRefs?: SourceRefs;
  prompt: { system: string; user: string };
}

export type BeginResult =
  | { kind: "started"; id: string }
  | { kind: "replay"; job: AiJob }
  | { kind: "rejected"; status: 409 | 429; error: string };

/** Jobs still "pending" after this long are treated as abandoned (the function was stopped). */
export const PENDING_WINDOW_MS = 6 * 60 * 1000;

/** Kinds where two concurrent runs for the same essay would race to produce the same artefact. */
const EXCLUSIVE_KINDS: ReadonlySet<AiJobKind> = new Set(["outline", "draft", "readiness_review", "prompt_analysis", "gap_questions", "blueprint"]);

/** A digest of the exact prompt, stored instead of the prompt itself so no personal data lands in metadata. */
export function promptDigest(prompt: { system: string; user: string }): string {
  return createHash("sha256").update(prompt.system).update("\u0000").update(prompt.user).digest("hex");
}

export async function beginJob(supabase: ServerSupabase, input: BeginJob): Promise<BeginResult> {
  // Replaying an idempotency key (double click, retry after a dropped connection) returns the original result.
  const { data: existing } = await supabase.from("ai_generation_jobs").select("*").eq("idempotency_key", input.idempotencyKey).maybeSingle<AiJob>();
  if (existing) {
    if (existing.status === "succeeded") return { kind: "replay", job: existing };
    if (existing.status === "pending") return { kind: "rejected", status: 409, error: "This request is already being processed." };
    return { kind: "rejected", status: 409, error: "This attempt did not finish. Start a new attempt to retry." };
  }

  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count } = await supabase.from("ai_generation_jobs").select("id", { count: "exact", head: true }).gte("created_at", since);
  const limit = getAiRateLimitPerHour();
  if ((count ?? 0) >= limit) {
    return { kind: "rejected", status: 429, error: `You have reached the limit of ${limit} AI requests per hour. Please try again later.` };
  }

  if (input.essayId && EXCLUSIVE_KINDS.has(input.kind)) {
    const { data: pending } = await supabase
      .from("ai_generation_jobs")
      .select("id")
      .eq("essay_id", input.essayId)
      .eq("kind", input.kind)
      .eq("status", "pending")
      .gte("created_at", new Date(Date.now() - PENDING_WINDOW_MS).toISOString())
      .limit(1);
    if (pending && pending.length > 0) {
      return { kind: "rejected", status: 409, error: "This step is already running for this essay. Please wait for it to finish." };
    }
  }

  const { data, error } = await supabase
    .from("ai_generation_jobs")
    .insert({
      kind: input.kind,
      action: input.action ?? null,
      essay_id: input.essayId ?? null,
      exemplar_id: input.exemplarId ?? null,
      application_id: input.applicationId ?? null,
      idempotency_key: input.idempotencyKey,
      status: "pending",
      model: input.model,
      prompt_version: input.promptVersion,
      settings: input.settings ?? {},
      source_refs: input.sourceRefs ?? {},
      input_digest: promptDigest(input.prompt),
    })
    .select("id")
    .single<{ id: string }>();
  if (error || !data) {
    if (error?.code === "23505") return { kind: "rejected", status: 409, error: "This request is already being processed." };
    throw new Error("Could not record the AI request.");
  }
  return { kind: "started", id: data.id };
}

export async function completeJob(
  supabase: ServerSupabase,
  id: string,
  patch: { model: string; usage: unknown; stopReason: string | null; output: unknown },
) {
  const { error } = await supabase
    .from("ai_generation_jobs")
    .update({
      status: "succeeded",
      model: patch.model,
      usage: patch.usage,
      stop_reason: patch.stopReason,
      output: patch.output,
      completed_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) throw new Error("Could not save the AI result.");
}

export async function failJob(supabase: ServerSupabase, id: string, message: string, cancelled = false) {
  await supabase
    .from("ai_generation_jobs")
    .update({ status: cancelled ? "cancelled" : "failed", error_message: message.slice(0, 500), completed_at: new Date().toISOString() })
    .eq("id", id);
}
