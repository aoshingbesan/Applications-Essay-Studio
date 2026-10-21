import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { jsonError, readJson, uuidParam } from "@/lib/api";
import { CONTEXT_LIMITS, buildEssayContext, entryText, essayQueryText, rank, resolveRefs } from "@/lib/ai/context";
import {
  blueprintValidator,
  critiqueValidator,
  draftValidator,
  evidenceRecommendationValidator,
  gapQuestionsValidator,
  outlineValidator,
  promptAnalysisValidator,
  readinessValidator,
  rewriteValidator,
  type GapQuestion,
} from "@/lib/ai/schemas";
import {
  EVIDENCE_RECOMMENDATION_VERSION,
  GAP_QUESTIONS_VERSION,
  OUTLINE_VERSION,
  PROMPT_ANALYSIS_VERSION,
  evidenceRecommendationPrompt,
  gapQuestionsPrompt,
  outlinePrompt,
  promptAnalysisPrompt,
} from "@/lib/ai/prompts/planning";
import {
  CRITIQUE_VERSION,
  DRAFT_VERSION,
  EDIT_ACTIONS,
  EDIT_ACTION_KEYS,
  READINESS_VERSION,
  REWRITE_VERSION,
  critiquePrompt,
  draftPrompt,
  readinessPrompt,
  rewritePrompt,
} from "@/lib/ai/prompts/writing";
import { BLUEPRINT_VERSION, blueprintPrompt } from "@/lib/ai/prompts/exemplars";
import { docFromSections, docFromText, countWords, docToPlainText } from "@/lib/essay/doc";
import { findOverlaps } from "@/lib/essay/overlap";
import { findingId } from "@/lib/essay/checks";
import type { ReviewFinding, SourceRefs } from "@/lib/domain/types";
import { runAi } from "@/server/internal/ai-run";
import { loadEssayBundle, type EssayBundle } from "@/server/internal/essay-data";

export const maxDuration = 300;

const idempotencyKey = z.string().uuid();

const bodySchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("analyse_prompt"), idempotencyKey }),
  z.object({ op: z.literal("gap_questions"), idempotencyKey }),
  z.object({ op: z.literal("recommend_evidence"), idempotencyKey }),
  z.object({ op: z.literal("blueprint"), idempotencyKey }),
  z.object({ op: z.literal("outline"), idempotencyKey, instructions: z.string().trim().max(2000).default("") }),
  z.object({
    op: z.literal("draft"),
    idempotencyKey,
    includeHeadings: z.boolean().default(false),
    instructions: z.string().trim().max(2000).default(""),
  }),
  z.object({
    op: z.literal("edit"),
    idempotencyKey,
    action: z.enum(EDIT_ACTION_KEYS),
    scope: z.enum(["selection", "essay"]),
    target: z.string().min(1).max(60000),
    essayText: z.string().max(80000),
    targetWords: z.number().int().min(10).max(20000).optional(),
    instruction: z.string().trim().max(1000).optional(),
  }),
  z.object({ op: z.literal("review"), idempotencyKey, essayText: z.string().min(1).max(80000) }),
]);
type Body = z.infer<typeof bodySchema>;

/** Copied passages from attached exemplars, reported with any AI-written text. */
function exemplarOverlap(bundle: EssayBundle, text: string) {
  return bundle.attachedExemplars
    .map((e) => ({ exemplar: e.title, passages: findOverlaps(text, e.source_text).slice(0, 5).map((m) => m.text) }))
    .filter((o) => o.passages.length > 0);
}

function mergeRefs(...all: SourceRefs[]): SourceRefs {
  const out: SourceRefs = {};
  for (const r of all) {
    for (const [k, v] of Object.entries(r) as [keyof SourceRefs, string[] | undefined][]) {
      if (!v?.length) continue;
      out[k] = Array.from(new Set([...(out[k] ?? []), ...v]));
    }
  }
  return out;
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!uuidParam.safeParse(id).success) return jsonError(404, "Essay not found.");
  const { supabase, user } = await getSessionUser();
  if (!user) return jsonError(401, "Your session has expired. Please sign in again.", { code: "unauthenticated" });
  const parsed = await readJson(request, bodySchema);
  if (!parsed.ok) return parsed.response;
  const body: Body = parsed.data;

  const bundle = await loadEssayBundle(supabase, id);
  if (!bundle) return jsonError(404, "Essay not found.");
  const { essay } = bundle;
  const base = { essayId: id, applicationId: essay.application_id, idempotencyKey: body.idempotencyKey };
  const signal = request.signal;

  switch (body.op) {
    case "analyse_prompt": {
      if (!essay.prompt.trim()) return jsonError(422, "Add the exact essay prompt before analysing it.");
      const ctx = buildEssayContext(bundle, { includeEvidence: false, includeDocuments: false, includeLessons: false });
      return runAi({
        supabase,
        job: { ...base, kind: "prompt_analysis", promptVersion: PROMPT_ANALYSIS_VERSION },
        prompt: promptAnalysisPrompt({ requirements: ctx.brief.requirements, opportunity: ctx.brief.opportunity }),
        operation: "prompt_analysis",
        validator: promptAnalysisValidator,
        effort: "medium",
        maxTokens: 8000,
        signal,
        finish: async (analysis) => {
          const { error } = await supabase.from("essays").update({ prompt_analysis: analysis }).eq("id", id);
          if (error) throw new Error("save failed");
          return { analysis };
        },
      });
    }

    case "gap_questions": {
      const ctx = buildEssayContext(bundle);
      return runAi({
        supabase,
        job: { ...base, kind: "gap_questions", promptVersion: GAP_QUESTIONS_VERSION, sourceRefs: ctx.sourceRefs },
        prompt: gapQuestionsPrompt({ ...ctx.brief, prompt_analysis: essay.prompt_analysis ?? undefined }),
        operation: "gap_questions",
        validator: gapQuestionsValidator,
        effort: "medium",
        maxTokens: 8000,
        signal,
        finish: async (out) => {
          // Keep questions the applicant already answered; replace the unanswered ones.
          const kept = essay.gap_questions.filter((q) => q.answer.trim());
          const fresh: GapQuestion[] = out.questions.map((q) => ({ ...q, id: crypto.randomUUID(), answer: "" }));
          const questions = [...kept, ...fresh].slice(0, 30);
          const { error } = await supabase.from("essays").update({ gap_questions: questions }).eq("id", id);
          if (error) throw new Error("save failed");
          return { questions };
        },
      });
    }

    case "recommend_evidence": {
      // Candidates: the most relevant Available entries plus Ask-first entries already approved
      // for this essay. Unapproved Ask-first and Private entries are never sent, even as suggestions.
      const query = essayQueryText(essay, bundle.application);
      const available = rank(query, bundle.entries.filter((e) => e.privacy === "available"), entryText).slice(0, CONTEXT_LIMITS.maxEntries).map((r) => r.item.id);
      const useCtx = buildEssayContext(
        { ...bundle, linked: { entryIds: Array.from(new Set([...bundle.linked.entryIds, ...available])), documentIds: [] } },
        { includeDocuments: false, includeLessons: false },
      );
      if (!(useCtx.brief.evidence as unknown[] | undefined)?.length) {
        return jsonError(422, "Add entries to your Story Bank (marked Available or approved for this essay) first.");
      }
      return runAi({
        supabase,
        job: { ...base, kind: "evidence_recommendation", promptVersion: EVIDENCE_RECOMMENDATION_VERSION, sourceRefs: useCtx.sourceRefs },
        prompt: evidenceRecommendationPrompt(useCtx.brief),
        operation: "evidence_recommendation",
        validator: evidenceRecommendationValidator,
        effort: "medium",
        maxTokens: 8000,
        signal,
        finish: async (out) => {
          const target = (ref: string) => useCtx.refs[ref.trim().toUpperCase()] ?? null;
          return {
            recommendations: out.recommendations.flatMap((r) => (target(r.ref) ? [{ ...r, target: target(r.ref)! }] : [])),
            notRecommended: out.not_recommended.flatMap((r) => (target(r.ref) ? [{ ...r, target: target(r.ref)! }] : [])),
            conflicts: out.conflicts,
            missing: out.missing,
          };
        },
      });
    }

    case "blueprint": {
      if (!bundle.lessons.length) return jsonError(422, "Select at least one exemplar lesson for this essay first.");
      const ctx = buildEssayContext({ ...bundle, essay: { ...essay, use_exemplars: true } }, { includeDocuments: false, aspects: ["structure", "opening", "evidence", "narrative", "tone", "conclusion"] });
      return runAi({
        supabase,
        job: { ...base, kind: "blueprint", promptVersion: BLUEPRINT_VERSION, sourceRefs: ctx.sourceRefs },
        prompt: blueprintPrompt(ctx.brief),
        operation: "blueprint",
        validator: blueprintValidator,
        effort: "medium",
        maxTokens: 8000,
        signal,
        finish: async (blueprint) => {
          const { error } = await supabase.from("essays").update({ blueprint }).eq("id", id);
          if (error) throw new Error("save failed");
          return { blueprint };
        },
      });
    }

    case "outline": {
      if (!essay.prompt.trim()) return jsonError(422, "Add the exact essay prompt before generating an outline.");
      const ctx = buildEssayContext(bundle);
      const brief = { ...ctx.brief, prompt_analysis: essay.prompt_analysis ?? undefined, blueprint: essay.use_exemplars ? (essay.blueprint ?? undefined) : undefined };
      const prompt = outlinePrompt(brief);
      if (body.instructions) prompt.user += `\n\nApplicant's instruction for this outline (follow it unless it conflicts with the rules): ${JSON.stringify(body.instructions).replace(/</g, "\\u003c")}`;
      return runAi({
        supabase,
        job: { ...base, kind: "outline", promptVersion: OUTLINE_VERSION, sourceRefs: ctx.sourceRefs, settings: { autoSelected: ctx.autoSelected } },
        prompt,
        operation: "outline",
        validator: outlineValidator,
        effort: "high",
        maxTokens: 16000,
        signal,
        finish: async (raw) => {
          // Aliases (S1, E2…) only mean something within one request: store readable labels instead.
          const label = (ref: string) => {
            const t = ctx.refs[ref.trim().toUpperCase()];
            if (!t) return null;
            if (t.type === "entry") return `Entry: ${bundle.entries.find((e) => e.id === t.id)?.title ?? ref}`;
            if (t.type === "document") return `Document: ${bundle.documents.find((d) => d.id === t.id)?.title ?? ref}`;
            return null;
          };
          const outline = { ...raw, sections: raw.sections.map((s) => ({ ...s, evidence_refs: s.evidence_refs.map(label).filter((x): x is string => Boolean(x)) })) };
          // A new outline needs the applicant's approval before drafting.
          const { error } = await supabase.from("essays").update({ outline, outline_status: "draft", outline_approved_at: null }).eq("id", id);
          if (error) throw new Error("save failed");
          return { outline, autoSelected: ctx.autoSelected };
        },
      });
    }

    case "draft": {
      if (essay.outline_status !== "approved" || !essay.outline) return jsonError(422, "Approve an outline before generating a draft.");
      const ctx = buildEssayContext(bundle, { includeOutline: true });
      return runAi({
        supabase,
        job: { ...base, kind: "draft", promptVersion: DRAFT_VERSION, sourceRefs: ctx.sourceRefs, settings: { includeHeadings: body.includeHeadings } },
        prompt: draftPrompt(ctx.brief, { includeHeadings: body.includeHeadings, instructions: body.instructions }),
        operation: "draft",
        validator: draftValidator,
        effort: "high",
        maxTokens: 32000,
        signal,
        finish: async (out) => {
          const doc = docFromSections(
            out.sections.map((s) => ({ heading: s.heading, paragraphs: s.paragraphs.map((p) => p.text) })),
            body.includeHeadings,
          );
          const text = docToPlainText(doc);
          const usedRefs = resolveRefs(out.sections.flatMap((s) => s.paragraphs.flatMap((p) => p.evidence_refs)), ctx.refs);
          return {
            doc,
            wordCount: countWords(text),
            flags: out.flags,
            usedRefs: mergeRefs(usedRefs, { exemplar_ids: ctx.sourceRefs.exemplar_ids, lesson_ids: ctx.sourceRefs.lesson_ids }),
            overlap: exemplarOverlap(bundle, text),
            summary: "Generated from the approved outline.",
          };
        },
      });
    }

    case "edit": {
      const action = EDIT_ACTIONS[body.action];
      if (body.action === "apply_lessons" && (!essay.use_exemplars || !bundle.lessons.length)) {
        return jsonError(422, "Turn on exemplar guidance and select lessons for this essay first.");
      }
      const ctx = buildEssayContext(bundle, { includeDocuments: true, includeLessons: body.action === "apply_lessons" || essay.use_exemplars });
      const targetWords = body.action === "word_limit" ? (body.targetWords ?? essay.max_words ?? undefined) : body.targetWords;
      if (action.mode === "critique") {
        return runAi({
          supabase,
          job: { ...base, kind: "critique", action: body.action, promptVersion: CRITIQUE_VERSION, sourceRefs: ctx.sourceRefs },
          prompt: critiquePrompt({ requirements: ctx.brief.requirements, opportunity: ctx.brief.opportunity }, { action: body.action, target: body.target, essayText: body.essayText }),
          operation: "critique",
          validator: critiqueValidator,
          effort: "medium",
          maxTokens: 8000,
          signal,
          finish: async (critique) => ({ mode: "critique", critique }),
        });
      }
      return runAi({
        supabase,
        job: { ...base, kind: "rewrite", action: body.action, promptVersion: REWRITE_VERSION, sourceRefs: ctx.sourceRefs, settings: { scope: body.scope, targetWords } },
        prompt: rewritePrompt(ctx.brief, { action: body.action, target: body.target, essayText: body.essayText, scope: body.scope, targetWords, instruction: body.instruction }),
        operation: "rewrite",
        validator: rewriteValidator,
        effort: "medium",
        maxTokens: body.scope === "essay" ? 32000 : 12000,
        signal,
        finish: async (out) => {
          const overlap = exemplarOverlap(bundle, out.revised);
          const summary = `${action.label}: ${out.changes.slice(0, 3).join(" ")}`.slice(0, 1000);
          if (body.scope === "essay") {
            const doc = docFromText(out.revised);
            return { mode: "revise", scope: "essay", original: body.target, revised: out.revised, doc, changes: out.changes, warnings: out.warnings, overlap, summary, label: action.label };
          }
          return { mode: "revise", scope: "selection", original: body.target, revised: out.revised, changes: out.changes, warnings: out.warnings, overlap, summary, label: action.label };
        },
      });
    }

    case "review": {
      const ctx = buildEssayContext(bundle, { includeLessons: false });
      const words = countWords(body.essayText);
      return runAi({
        supabase,
        job: { ...base, kind: "readiness_review", promptVersion: READINESS_VERSION, sourceRefs: ctx.sourceRefs },
        prompt: readinessPrompt({ ...ctx.brief, prompt_analysis: essay.prompt_analysis ?? undefined }, body.essayText, words),
        operation: "readiness_review",
        validator: readinessValidator,
        effort: "high",
        maxTokens: 16000,
        signal,
        finish: async (out, { jobId }) => {
          const findings: ReviewFinding[] = out.findings.map((f) => ({
            id: findingId(`ai-${f.dimension}`, `${f.issue}|${f.excerpt}`),
            category: f.dimension,
            label: f.label,
            severity: f.severity,
            issue: f.issue,
            why: f.why,
            excerpt: f.excerpt || undefined,
            requirement: f.requirement || undefined,
            suggestion: f.suggestion,
            source: "ai",
          }));
          const { data, error } = await supabase
            .from("essay_reviews")
            .insert({ essay_id: id, kind: "ai", job_id: jobId, essay_revision: essay.revision, word_count: words, findings, summary: { summary: out.summary, dimensions: out.dimensions } })
            .select("id, created_at")
            .single<{ id: string; created_at: string }>();
          if (error || !data) throw new Error("save failed");
          return { reviewId: data.id, createdAt: data.created_at, findings, summary: out.summary, dimensions: out.dimensions };
        },
      });
    }
  }
}
