import { NextResponse, after } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { jsonError, readJson, uuidParam } from "@/lib/api";
import { AiError, callStructured, configuredModel, isAiConfigured } from "@/lib/ai/client";
import { beginJob, completeJob, failJob, PENDING_WINDOW_MS } from "@/lib/ai/guard";
import { exemplarReportValidator } from "@/lib/ai/schemas";
import { EXEMPLAR_ANALYSIS_VERSION, EXEMPLAR_SPEC_VERSION, exemplarAnalysisPrompt } from "@/lib/ai/prompts/exemplars";
import type { Exemplar, ExemplarAnalysis } from "@/lib/domain/types";

export const maxDuration = 300;

const bodySchema = z.object({ idempotencyKey: z.string().uuid(), force: z.boolean().default(false) });

/** Latest analysis status, for polling. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!uuidParam.safeParse(id).success) return jsonError(404, "Exemplar not found.");
  const { supabase, user } = await getSessionUser();
  if (!user) return jsonError(401, "Your session has expired. Please sign in again.", { code: "unauthenticated" });
  const { data } = await supabase
    .from("exemplar_analyses")
    .select("id, status, error_message, created_at, completed_at, source_hash, spec_version")
    .eq("exemplar_id", id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<Pick<ExemplarAnalysis, "id" | "status" | "error_message" | "created_at" | "completed_at" | "source_hash" | "spec_version">>();
  return NextResponse.json({ ok: true, analysis: data ?? null });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!uuidParam.safeParse(id).success) return jsonError(404, "Exemplar not found.");
  const { supabase, user } = await getSessionUser();
  if (!user) return jsonError(401, "Your session has expired. Please sign in again.", { code: "unauthenticated" });
  const parsed = await readJson(request, bodySchema);
  if (!parsed.ok) return parsed.response;

  if (!isAiConfigured()) return jsonError(503, "AI features are not configured on this server. Add ANTHROPIC_API_KEY to enable analysis.", { code: "unavailable" });
  const { data: profile } = await supabase.from("profiles").select("ai_enabled").maybeSingle<{ ai_enabled: boolean }>();
  if (profile && !profile.ai_enabled) return jsonError(403, "AI features are switched off in your settings.", { code: "ai_disabled" });

  const { data: exemplar } = await supabase.from("exemplars").select("*").eq("id", id).maybeSingle<Exemplar>();
  if (!exemplar) return jsonError(404, "Exemplar not found.");
  if (!exemplar.permission_confirmed_at) return jsonError(422, "Confirm that you have permission to use this essay before analysing it.");
  if (exemplar.word_count < 50 || !exemplar.source_hash) return jsonError(422, "This exemplar has no readable text to analyse. Paste the text or upload a text-based file.");

  // Cache: an analysis is reused only for the same text (hash) and the same analysis specification.
  if (!parsed.data.force) {
    const { data: cached } = await supabase
      .from("exemplar_analyses")
      .select("id")
      .eq("exemplar_id", id)
      .eq("status", "complete")
      .eq("source_hash", exemplar.source_hash)
      .eq("spec_version", EXEMPLAR_SPEC_VERSION)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<{ id: string }>();
    if (cached) return NextResponse.json({ ok: true, analysisId: cached.id, status: "complete", cached: true });
  }

  // Recover from an analysis whose function was stopped before it finished.
  await supabase
    .from("exemplar_analyses")
    .update({ status: "failed", error_message: "The analysis did not finish. Please try again.", completed_at: new Date().toISOString() })
    .eq("exemplar_id", id)
    .in("status", ["queued", "running"])
    .lt("created_at", new Date(Date.now() - PENDING_WINDOW_MS).toISOString());

  const prompt = exemplarAnalysisPrompt(exemplar);
  const begin = await beginJob(supabase, {
    kind: "exemplar_analysis",
    exemplarId: id,
    idempotencyKey: parsed.data.idempotencyKey,
    model: configuredModel() ?? "unknown",
    promptVersion: EXEMPLAR_ANALYSIS_VERSION,
    settings: { spec_version: EXEMPLAR_SPEC_VERSION, source_hash: exemplar.source_hash },
    prompt,
  });
  if (begin.kind === "rejected") return jsonError(begin.status, begin.error);
  if (begin.kind === "replay") {
    const out = begin.job.output as { analysisId?: string } | null;
    return NextResponse.json({ ok: true, analysisId: out?.analysisId ?? null, status: "complete", replay: true });
  }

  const { data: analysis, error } = await supabase
    .from("exemplar_analyses")
    .insert({
      exemplar_id: id,
      status: "queued",
      source_hash: exemplar.source_hash,
      spec_version: EXEMPLAR_SPEC_VERSION,
      prompt_version: EXEMPLAR_ANALYSIS_VERSION,
      job_id: begin.id,
    })
    .select("id")
    .single<{ id: string }>();
  if (error || !analysis) {
    await failJob(supabase, begin.id, "Another analysis is already running.");
    if (error?.code === "23505") return jsonError(409, "This exemplar is already being analysed. Please wait for it to finish.");
    return jsonError(500, "Could not start the analysis.");
  }

  // The analysis can take a minute or two: respond now and finish in the background.
  after(async () => {
    await supabase.from("exemplar_analyses").update({ status: "running", started_at: new Date().toISOString() }).eq("id", analysis.id);
    try {
      const result = await callStructured({
        operation: "exemplar_analysis",
        system: prompt.system,
        user: prompt.user,
        validator: exemplarReportValidator,
        effort: "high",
        maxTokens: 32000,
      });
      // Guard against analysing text that changed while the job ran: never attach a report to different text.
      const { data: current } = await supabase.from("exemplars").select("source_hash").eq("id", id).maybeSingle<{ source_hash: string }>();
      if (current?.source_hash !== exemplar.source_hash) throw new AiError("The essay text changed during analysis. Please run it again.", "invalid_output", true);
      const { error: saveError } = await supabase
        .from("exemplar_analyses")
        .update({ status: "complete", report: result.data, model: result.model, completed_at: new Date().toISOString() })
        .eq("id", analysis.id);
      if (saveError) throw new Error("save failed");
      await completeJob(supabase, begin.id, { model: result.model, usage: result.usage, stopReason: result.stopReason, output: { analysisId: analysis.id } });
    } catch (e) {
      const message = e instanceof AiError ? e.message : "The analysis failed. Please try again.";
      if (!(e instanceof AiError)) console.error("[exemplar-analysis]", e instanceof Error ? e.message : "unknown error");
      await supabase.from("exemplar_analyses").update({ status: "failed", error_message: message, completed_at: new Date().toISOString() }).eq("id", analysis.id);
      await failJob(supabase, begin.id, message);
    }
  });

  return NextResponse.json({ ok: true, analysisId: analysis.id, status: "queued" }, { status: 202 });
}
