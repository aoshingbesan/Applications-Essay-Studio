// Assembles only the information an AI operation needs, from data already loaded under RLS.
// Pure functions: no I/O, so retrieval and context budgets are unit-tested directly.

import { ESSAY_TYPE_GUIDANCE, FUTURE_SECTIONS, MAX_DOCUMENT_EXCERPT_CHARS, type ExemplarAspect } from "@/lib/domain/constants";
import { keywords, splitItems } from "@/lib/text/keywords";
import type {
  Application,
  Essay,
  PersonalEvidence,
  SelectedLesson,
  SourceRefs,
  Story,
  SupportingDocument,
  WritingPreferences,
} from "@/lib/domain/types";

export interface EssayContextData {
  essay: Essay;
  application: Application;
  preferences: WritingPreferences;
  evidence: PersonalEvidence[];
  stories: Story[];
  documents: SupportingDocument[];
  linked: { storyIds: string[]; evidenceIds: string[]; documentIds: string[] };
  lessons: SelectedLesson[];
  exemplarTitles: Record<string, string>;
}

export type RefTarget = { type: "story" | "evidence" | "document" | "lesson"; id: string };

/** Limits that keep prompts focused and well inside the context window. */
export const CONTEXT_LIMITS = {
  autoStories: 6,
  autoEvidence: 14,
  maxStories: 12,
  maxEvidence: 40,
  maxDocuments: 6,
  totalDocumentChars: 24000,
  maxLessons: 20,
};

// ---------------------------------------------------------------------------
// Relevance
// ---------------------------------------------------------------------------

export function essayQueryText(essay: Pick<Essay, "prompt" | "required_themes" | "selection_criteria" | "title">, application?: Pick<Application, "selection_criteria">): string {
  return [essay.title, essay.prompt, essay.required_themes.join(" "), essay.selection_criteria ?? "", application?.selection_criteria ?? ""].join("\n");
}

export function storyText(s: Story): string {
  return [s.title, s.context, s.challenge, s.actions, s.outcome, s.measurable_impact, s.lessons, s.motivation, s.skills.join(" "), s.related_criteria.join(" "), s.tags.join(" ")]
    .filter(Boolean)
    .join(" ");
}

export function evidenceText(e: PersonalEvidence): string {
  return [e.title, e.details, e.organisation].filter(Boolean).join(" ");
}

export interface Ranked<T> {
  item: T;
  score: number;
  matched: string[];
}

/** Scores items by stemmed keyword overlap with the query. Items with no overlap score 0. */
export function rank<T>(query: string, items: T[], toText: (item: T) => string): Ranked<T>[] {
  const q = keywords(query);
  return items
    .map((item) => {
      const k = keywords(toText(item));
      const matched = [...k].filter((w) => q.has(w));
      // Normalise lightly by length so long entries do not win on volume alone.
      const score = matched.length / Math.sqrt(Math.max(k.size, 1));
      return { item, score, matched };
    })
    .sort((a, b) => b.score - a.score);
}

/** Paragraphs of a document most relevant to the query, in original order, within a character budget. */
export function excerpt(text: string, query: string, maxChars: number): string {
  const clean = text.replace(/\r/g, "").trim();
  if (clean.length <= maxChars) return clean;
  const paras = clean.split(/\n{2,}|\n(?=\s*[-•*\d])/).map((p) => p.trim()).filter(Boolean);
  const ranked = rank(query, paras.map((p, i) => ({ p, i })), (x) => x.p);
  const chosen = new Set<number>();
  let used = 0;
  for (const r of ranked) {
    const len = r.item.p.length + 2;
    if (used + len > maxChars) continue;
    chosen.add(r.item.i);
    used += len;
  }
  if (chosen.size === 0) return clean.slice(0, maxChars) + " […]";
  const ordered = paras.filter((_, i) => chosen.has(i));
  return ordered.join("\n\n") + "\n\n[…excerpt; other parts of the document omitted]";
}

// ---------------------------------------------------------------------------
// Evidence status
// ---------------------------------------------------------------------------

/** How a fact may be used: accomplished facts as facts, aspirations only as plans, unverified only flagged. */
export function evidenceStatus(e: Pick<PersonalEvidence, "classification" | "section">): "accomplished" | "aspiration" | "reflection" | "unverified" {
  if (e.classification === "goal_aspiration" || FUTURE_SECTIONS.includes(e.section)) return "aspiration";
  if (e.classification === "unverified") return "unverified";
  if (e.classification === "personal_reflection") return "reflection";
  return "accomplished";
}

const clean = (v: string | null | undefined) => {
  const t = v?.trim();
  return t ? t : undefined;
};

function compact<T extends Record<string, unknown>>(obj: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined && v !== null && v !== "" && !(Array.isArray(v) && v.length === 0)),
  ) as Partial<T>;
}

// ---------------------------------------------------------------------------
// Context assembly
// ---------------------------------------------------------------------------

export interface BuiltContext {
  brief: Record<string, unknown>;
  refs: Record<string, RefTarget>;
  sourceRefs: SourceRefs;
  /** True when the user selected no evidence and the most relevant items were chosen automatically. */
  autoSelected: boolean;
}

export interface ContextOptions {
  includeEvidence?: boolean;
  includeDocuments?: boolean;
  includeLessons?: boolean;
  includeOutline?: boolean;
  /** Overrides the essay's own aspect selection. */
  aspects?: ExemplarAspect[];
}

export function requirementsBrief(essay: Essay, application: Application) {
  return compact({
    essay_title: essay.title,
    essay_type: essay.essay_type,
    exact_prompt: essay.prompt || undefined,
    word_limit: compact({ minimum: essay.min_words ?? undefined, maximum: essay.max_words ?? undefined }),
    required_themes: essay.required_themes,
    essay_selection_criteria: splitItems(essay.selection_criteria ?? ""),
    application_selection_criteria: splitItems(application.selection_criteria ?? ""),
    required_format: clean(essay.required_format),
    essay_instructions: clean(essay.instructions),
    official_application_instructions: clean(application.official_instructions),
    restrictions: clean(essay.restrictions),
    category_guidance: ESSAY_TYPE_GUIDANCE[essay.essay_type],
  });
}

export function opportunityBrief(application: Application) {
  return compact({
    institution: application.institution,
    programme: application.programme,
    category: application.category,
    country: clean(application.country),
    programme_description: clean(application.course_description)?.slice(0, 6000),
    applicant_reason_for_applying: clean(application.reason_for_applying),
  });
}

export function preferencesBrief(p: WritingPreferences) {
  return compact({
    tone: clean(p.tone),
    formality: clean(p.formality),
    style: clean(p.style),
    important_themes: p.themes ?? [],
    experiences_to_feature: clean(p.experiences),
    topics_to_avoid: clean(p.avoid),
    voice: clean(p.voice),
    additional_instructions: clean(p.instructions),
    spelling: p.spelling,
  });
}

export function buildEssayContext(data: EssayContextData, options: ContextOptions = {}): BuiltContext {
  const { essay, application } = data;
  const opts = { includeEvidence: true, includeDocuments: true, includeLessons: true, includeOutline: false, ...options };
  const query = essayQueryText(essay, application);
  const refs: Record<string, RefTarget> = {};
  const sourceRefs: SourceRefs = { story_ids: [], evidence_ids: [], document_ids: [], exemplar_ids: [], lesson_ids: [] };

  const brief: Record<string, unknown> = {
    requirements: requirementsBrief(essay, application),
    opportunity: opportunityBrief(application),
    writing_preferences: preferencesBrief(data.preferences),
  };

  let autoSelected = false;
  if (opts.includeEvidence) {
    const anyLinked = data.linked.storyIds.length + data.linked.evidenceIds.length > 0;
    autoSelected = !anyLinked;
    const activeStories = data.stories.filter((s) => !s.archived_at);
    const activeEvidence = data.evidence.filter((e) => !e.archived_at);
    const stories = anyLinked
      ? activeStories.filter((s) => data.linked.storyIds.includes(s.id)).slice(0, CONTEXT_LIMITS.maxStories)
      : rank(query, activeStories, storyText).filter((r) => r.score > 0).slice(0, CONTEXT_LIMITS.autoStories).map((r) => r.item);
    // Linked items come first; core background (education, goals) is always useful context.
    const evidence = anyLinked
      ? activeEvidence.filter((e) => data.linked.evidenceIds.includes(e.id)).slice(0, CONTEXT_LIMITS.maxEvidence)
      : rank(query, activeEvidence, evidenceText)
          .filter((r) => r.score > 0 || ["education", "career_goals", "background"].includes(r.item.section))
          .slice(0, CONTEXT_LIMITS.autoEvidence)
          .map((r) => r.item);

    brief.stories = stories.map((s, i) => {
      const alias = `S${i + 1}`;
      refs[alias] = { type: "story", id: s.id };
      sourceRefs.story_ids!.push(s.id);
      return compact({
        ref: alias,
        title: s.title,
        period: clean(s.period),
        context: clean(s.context),
        challenge_or_opportunity: clean(s.challenge),
        applicant_actions: clean(s.actions),
        outcome: clean(s.outcome),
        measurable_impact: clean(s.measurable_impact),
        lessons_learned: clean(s.lessons),
        motivation: clean(s.motivation),
        skills: s.skills,
        related_criteria: s.related_criteria,
        verification: s.verification_status,
      });
    });
    brief.profile_evidence = evidence.map((e, i) => {
      const alias = `E${i + 1}`;
      refs[alias] = { type: "evidence", id: e.id };
      sourceRefs.evidence_ids!.push(e.id);
      return compact({
        ref: alias,
        section: e.section,
        title: e.title,
        details: clean(e.details),
        organisation: clean(e.organisation),
        period: clean(e.period),
        classification: e.classification,
        status: evidenceStatus(e),
        source: clean(e.source),
      });
    });
    if (autoSelected) {
      brief.evidence_selection_note =
        "The applicant has not selected evidence for this essay. These items were chosen automatically for relevance; use only what genuinely serves the prompt.";
    }
  }

  if (opts.includeDocuments) {
    const docs = data.documents.filter((d) => data.linked.documentIds.includes(d.id) && d.extraction_status === "extracted" && d.extracted_text);
    let budget = CONTEXT_LIMITS.totalDocumentChars;
    brief.document_excerpts = docs.slice(0, CONTEXT_LIMITS.maxDocuments).flatMap((d, i) => {
      if (budget <= 500) return [];
      const text = excerpt(d.extracted_text ?? "", query, Math.min(MAX_DOCUMENT_EXCERPT_CHARS, budget));
      budget -= text.length;
      const alias = `D${i + 1}`;
      refs[alias] = { type: "document", id: d.id };
      sourceRefs.document_ids!.push(d.id);
      return [{ ref: alias, title: d.title, type: d.doc_type, untrusted_text: text }];
    });
  }

  if (opts.includeLessons && essay.use_exemplars) {
    const aspects = new Set<string>(opts.aspects ?? essay.exemplar_aspects);
    const lessons = data.lessons.filter((l) => l.aspect === "lesson" || aspects.has(l.aspect)).slice(0, CONTEXT_LIMITS.maxLessons);
    brief.exemplar_lessons = lessons.map((l, i) => {
      const alias = `L${i + 1}`;
      refs[alias] = { type: "lesson", id: l.id };
      sourceRefs.lesson_ids!.push(l.id);
      if (!sourceRefs.exemplar_ids!.includes(l.exemplar_id)) sourceRefs.exemplar_ids!.push(l.exemplar_id);
      return { ref: alias, aspect: l.aspect, lesson: l.content, from: data.exemplarTitles[l.exemplar_id] ?? "Exemplar" };
    });
    if (lessons.length) brief.exemplar_aspects_enabled = [...aspects];
  }

  if (opts.includeOutline && essay.outline) {
    brief.approved_outline = essay.outline;
  }

  const answered = essay.gap_questions.filter((q) => q.answer.trim());
  if (answered.length) {
    brief.applicant_answers = answered.map((q) => ({ question: q.question, answer: q.answer }));
  }
  const unanswered = essay.gap_questions.filter((q) => !q.answer.trim() && q.importance === "critical");
  if (unanswered.length) brief.unanswered_critical_questions = unanswered.map((q) => q.question);

  return { brief: compact(brief), refs, sourceRefs, autoSelected };
}

/** Maps model-supplied aliases (S1, E2…) back to record IDs, ignoring anything unknown. */
export function resolveRefs(aliases: string[], refs: Record<string, RefTarget>): SourceRefs {
  const out: SourceRefs = { story_ids: [], evidence_ids: [], document_ids: [], lesson_ids: [] };
  for (const a of aliases) {
    const t = refs[a.trim().toUpperCase()];
    if (!t) continue;
    const key = `${t.type === "evidence" ? "evidence" : t.type}_ids` as keyof SourceRefs;
    const list = (out[key] ??= []);
    if (!list.includes(t.id)) list.push(t.id);
  }
  return out;
}

/**
 * Serialises data for a prompt. "<" is escaped so text from uploaded files cannot close or forge
 * the XML-style tags that separate instructions from data.
 */
export function safeJson(value: unknown): string {
  return JSON.stringify(value, null, 1).replace(/</g, "\\u003c");
}
