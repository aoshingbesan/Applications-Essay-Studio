// Exemplar analysis, comparison and personalised blueprint.

import { PROVENANCE_LABELS } from "@/lib/domain/constants";
import type { Exemplar } from "@/lib/domain/types";
import type { ExemplarReport } from "../schemas";
import { safeJson } from "../context";
import { dataBlock, EXEMPLAR_RULES, UNTRUSTED_DATA_RULE } from "./shared";

export const EXEMPLAR_ANALYSIS_VERSION = "exemplar-analysis-2026-10-v1";
/**
 * The analysis specification: bump when the report structure or what it covers changes.
 * Cached analyses are reused only when both the source text hash and this version match.
 */
export const EXEMPLAR_SPEC_VERSION = "spec-1";
export const EXEMPLAR_COMPARISON_VERSION = "exemplar-comparison-2026-10-v1";
export const BLUEPRINT_VERSION = "blueprint-2026-10-v1";

const ANALYST = `You are a writing analyst who studies application essays to teach transferable techniques. You analyse how an essay works; you never rewrite or reproduce it.`;

export function exemplarAnalysisPrompt(exemplar: Exemplar) {
  const meta = {
    title: exemplar.title,
    essay_category: exemplar.essay_category,
    institution: exemplar.institution,
    programme: exemplar.programme,
    original_prompt: exemplar.original_prompt,
    original_word_limit: exemplar.original_word_limit,
    application_year: exemplar.application_year,
    provenance: PROVENANCE_LABELS[exemplar.provenance],
    measured_word_count: exemplar.word_count,
  };
  return {
    system: `${ANALYST}

Produce a structured report on the exemplar essay in the application data.

- Ground every observation in the text. When you illustrate a point, paraphrase or quote at most a few words; never reproduce sentences or passages.
- Keep three kinds of statement distinct: direct observations about the text, your interpretations of why something works, and recommendations. Each lesson carries a basis of "observed", "interpreted" or "recommended".
- Provenance matters. The essay's outcome is reported as "${PROVENANCE_LABELS[exemplar.provenance]}". Never state or imply that it won a scholarship or secured admission beyond that, and never claim that any technique caused a successful outcome.
- Prompt alignment: set alignment.available to true only if an original prompt was supplied; then map each requirement to how the essay addresses it. If no prompt was supplied, set it to false, leave items empty and explain in note. Do not claim to know the institution's real evaluation criteria.
- Limitations must include the caveat that conclusions drawn from a single sample are limited.
- Lessons are high-level, transferable strategies (e.g. connecting a personal experience to a wider problem), each tagged with the aspect it concerns: structure, opening, evidence, narrative, tone, conclusion, or general. Include 6–12 lessons, only ones genuinely supported by this essay.
- The blueprint is a reusable plan another applicant could follow with their own, different experiences: opening strategy, structure with approximate shares, questions the applicant should answer, evidence needed, balance guidance and weaknesses to avoid. It must not contain this author's experiences.

${EXEMPLAR_RULES}

${UNTRUSTED_DATA_RULE}`,
    user: `${dataBlock(safeJson({ exemplar_metadata: meta, exemplar_text: exemplar.source_text }))}\n\nReturn the report as JSON matching the schema.`,
  };
}

export function exemplarComparisonPrompt(items: { title: string; provenance: string; report: ExemplarReport }[]) {
  return {
    system: `${ANALYST}

Compare the analysis reports of several exemplar essays. Identify techniques they share, and dimensions where they take genuinely different approaches (e.g. opening type, structure, how evidence is introduced, tone). Refer to exemplars by their titles. Make practical recommendations for an applicant choosing between approaches, and state caveats: a handful of samples cannot show which technique causes success, provenance differs between samples, and what suits one prompt may not suit another.

${UNTRUSTED_DATA_RULE}`,
    user: `${dataBlock(safeJson({ exemplars: items }))}\n\nReturn the comparison as JSON matching the schema.`,
  };
}

export function blueprintPrompt(brief: Record<string, unknown>) {
  return {
    system: `You are an application-writing adviser. Turn the writing lessons the applicant selected from exemplar essays into a personalised blueprint for their own essay, adapted to the exact prompt, word limit and the applicant's evidence. The official prompt takes priority: drop or adapt any lesson that does not fit it. Word allocations must sum to roughly the word limit. Questions to answer and evidence needed must be about the applicant's own experience. In lessons_applied, say how each lesson is used (or why it was adapted).

${EXEMPLAR_RULES}

${UNTRUSTED_DATA_RULE}`,
    user: `${dataBlock(safeJson(brief))}\n\nReturn the blueprint as JSON matching the schema.`,
  };
}
