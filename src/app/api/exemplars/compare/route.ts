import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { jsonError, readJson } from "@/lib/api";
import { exemplarComparisonValidator, type ExemplarReport } from "@/lib/ai/schemas";
import { EXEMPLAR_COMPARISON_VERSION, EXEMPLAR_SPEC_VERSION, exemplarComparisonPrompt } from "@/lib/ai/prompts/exemplars";
import { PROVENANCE_LABELS } from "@/lib/domain/constants";
import type { Exemplar } from "@/lib/domain/types";
import { runAi } from "@/server/internal/ai-run";

export const maxDuration = 300;

const bodySchema = z.object({
  idempotencyKey: z.string().uuid(),
  exemplarIds: z.array(z.string().uuid()).min(2).max(5),
});

export async function POST(request: Request) {
  const { supabase, user } = await getSessionUser();
  if (!user) return jsonError(401, "Your session has expired. Please sign in again.", { code: "unauthenticated" });
  const parsed = await readJson(request, bodySchema);
  if (!parsed.ok) return parsed.response;
  const ids = Array.from(new Set(parsed.data.exemplarIds));
  if (ids.length < 2) return jsonError(422, "Choose at least two different exemplars.");

  const [{ data: exemplars }, { data: analyses }] = await Promise.all([
    supabase.from("exemplars").select("id, title, provenance, source_hash").in("id", ids).returns<Pick<Exemplar, "id" | "title" | "provenance" | "source_hash">[]>(),
    supabase
      .from("exemplar_analyses")
      .select("exemplar_id, report, source_hash, created_at")
      .in("exemplar_id", ids)
      .eq("status", "complete")
      .eq("spec_version", EXEMPLAR_SPEC_VERSION)
      .order("created_at", { ascending: false })
      .returns<{ exemplar_id: string; report: ExemplarReport; source_hash: string }[]>(),
  ]);
  if (!exemplars || exemplars.length !== ids.length) return jsonError(404, "One or more exemplars were not found.");

  // Each exemplar is compared using its own, current analysis only.
  const items = exemplars.map((e) => {
    const a = (analyses ?? []).find((x) => x.exemplar_id === e.id && x.source_hash === e.source_hash);
    return a ? { title: e.title, provenance: PROVENANCE_LABELS[e.provenance], report: a.report } : null;
  });
  if (items.some((i) => i === null)) return jsonError(422, "Analyse every selected exemplar (with its current text) before comparing them.");

  return runAi({
    supabase,
    job: { kind: "exemplar_comparison", idempotencyKey: parsed.data.idempotencyKey, promptVersion: EXEMPLAR_COMPARISON_VERSION, sourceRefs: { exemplar_ids: ids } },
    prompt: exemplarComparisonPrompt(items as NonNullable<(typeof items)[number]>[]),
    operation: "exemplar_comparison",
    validator: exemplarComparisonValidator,
    effort: "medium",
    maxTokens: 16000,
    signal: request.signal,
    finish: async (comparison) => ({ comparison }),
  });
}
