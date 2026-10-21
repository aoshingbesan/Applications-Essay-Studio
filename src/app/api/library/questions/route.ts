import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { jsonError, readJson } from "@/lib/api";
import { sectionQuestionsValidator } from "@/lib/ai/schemas";
import { SECTION_QUESTIONS_VERSION, sectionQuestionsPrompt } from "@/lib/ai/prompts/planning";
import { ENTRY_SECTIONS, SECTION_BY_KEY } from "@/lib/library/sections";
import type { LibraryEntry } from "@/lib/domain/types";
import { runAi } from "@/server/internal/ai-run";

export const maxDuration = 300;

const bodySchema = z.object({ idempotencyKey: z.string().uuid(), section: z.enum(ENTRY_SECTIONS) });

const clip = (v: string | null, n: number) => (v?.trim() ? v.trim().slice(0, n) : undefined);

/** Guided follow-up questions for one Story Bank section. Only entries marked Available are sent. */
export async function POST(request: Request) {
  const { supabase, user } = await getSessionUser();
  if (!user) return jsonError(401, "Your session has expired. Please sign in again.", { code: "unauthenticated" });
  const parsed = await readJson(request, bodySchema);
  if (!parsed.ok) return parsed.response;
  const def = SECTION_BY_KEY[parsed.data.section];

  const { data: entries } = await supabase
    .from("library_entries")
    .select("*")
    .is("archived_at", null)
    .or(`section.eq.${parsed.data.section},also_in.cs.{${parsed.data.section}}`)
    .order("position")
    .limit(60)
    .returns<LibraryEntry[]>();
  // Ask-first and Private entries are left out entirely — not even their titles are sent.
  const shared = (entries ?? []).filter((e) => e.privacy === "available").slice(0, 25);
  const refs = new Map(shared.map((e, i) => [`E${i + 1}`, e.id]));

  return runAi({
    supabase,
    job: { kind: "section_questions", action: parsed.data.section, idempotencyKey: parsed.data.idempotencyKey, promptVersion: SECTION_QUESTIONS_VERSION, sourceRefs: { entry_ids: shared.map((e) => e.id) } },
    prompt: sectionQuestionsPrompt({
      section: def.title,
      description: def.description,
      prompts: def.prompts,
      futureFacing: Boolean(def.futureFacing),
      entries: shared.map((e, i) => ({
        ref: `E${i + 1}`,
        title: e.title,
        summary: clip(e.summary, 1500),
        organisation: clip(e.organisation, 200),
        role: clip(e.role, 200),
        period: clip(e.period, 100),
        figures: clip(e.figures, 500),
        context: clip(e.context, 1500),
        challenge: clip(e.challenge, 1500),
        actions: clip(e.actions, 1500),
        outcome: clip(e.outcome, 1500),
        lessons: clip(e.lessons, 1500),
        narrative: clip(e.narrative, 2500),
        classification: e.classification,
      })),
    }),
    operation: "section_questions",
    validator: sectionQuestionsValidator,
    effort: "medium",
    maxTokens: 8000,
    signal: request.signal,
    finish: async (out) => ({
      questions: out.questions.map((q) => ({
        entryId: q.entry_ref ? (refs.get(q.entry_ref.trim().toUpperCase()) ?? null) : null,
        question: q.question,
        why: q.why,
        focus: q.focus,
      })),
      withheld: (entries ?? []).length - shared.length,
    }),
  });
}
