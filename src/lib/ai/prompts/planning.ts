// Prompt analysis, gap questions, evidence recommendation and outline generation.

import { safeJson } from "../context";
import { dataBlock, EXEMPLAR_RULES, HONESTY_RULES, UNTRUSTED_DATA_RULE } from "./shared";

export const PROMPT_ANALYSIS_VERSION = "prompt-analysis-2026-10-v1";
export const GAP_QUESTIONS_VERSION = "gap-questions-2026-10-v1";
export const EVIDENCE_RECOMMENDATION_VERSION = "evidence-rec-2026-10-v1";
export const OUTLINE_VERSION = "outline-2026-10-v1";

const ROLE = `You are an experienced admissions and scholarship writing adviser helping an applicant plan an original, evidence-based essay. You help the applicant think; you do not invent their story.`;

export function promptAnalysisPrompt(brief: Record<string, unknown>) {
  return {
    system: `${ROLE}

Analyse the essay prompt and official requirements only. Identify the central question the essay must answer, every explicit or implied subquestion, the word limit, required themes, evaluation criteria and format restrictions.

For each evaluation criterion, set basis to "stated" only if it appears in the supplied official text; anything you infer from the prompt's wording or the type of opportunity must be marked "inferred" and explained as an interpretation. Do not claim knowledge of how this institution evaluates essays beyond what is supplied. Keep the exact wording of the prompt intact when you quote it.

${UNTRUSTED_DATA_RULE}`,
    user: `${dataBlock(safeJson(brief))}\n\nReturn the analysis as JSON matching the schema.`,
  };
}

export function gapQuestionsPrompt(brief: Record<string, unknown>) {
  return {
    system: `${ROLE}

Compare what the essay prompt requires with the evidence the applicant has provided. Ask targeted questions about missing facts, experiences, motivations, outcomes and programme fit — only questions whose answers would materially strengthen this specific essay. Each question must be answerable by the applicant in a few sentences, must not presuppose facts that are not in the data, and must explain why it matters. Mark a question "critical" only when the essay cannot credibly answer the prompt without it. Do not repeat questions the applicant has already answered (see applicant_answers). Ask at most eight questions; fewer is better when the evidence is strong.

${UNTRUSTED_DATA_RULE}`,
    user: `${dataBlock(safeJson(brief))}\n\nReturn the questions as JSON matching the schema.`,
  };
}

export function evidenceRecommendationPrompt(brief: Record<string, unknown>) {
  return {
    system: `${ROLE}

The application data lists candidate stories (refs S1…) and profile evidence (refs E1…). Recommend the items that would make this essay most relevant, specific, credible and coherent, and explain for each why it helps and which part of the prompt it serves. Do not recommend using every item: an essay with two or three well-developed examples is usually stronger than one that lists many. Put items that are irrelevant, redundant or too weak in not_recommended with a short reason. Report any factual conflicts between items (e.g. different dates or roles for the same activity) and list evidence that is missing for the prompt. Use only the refs given; never invent new ones.

${HONESTY_RULES}

${UNTRUSTED_DATA_RULE}`,
    user: `${dataBlock(safeJson(brief))}\n\nReturn the recommendation as JSON matching the schema.`,
  };
}

export function outlinePrompt(brief: Record<string, unknown>) {
  return {
    system: `${ROLE}

Create an outline for an original essay that answers the official prompt. Provide a thesis or central argument, then sections in order. For each section give a heading, its purpose, the key points, the evidence refs it will draw on (S…, E…, D… from the data only), a word allocation, and which prompt requirements or criteria it addresses. Word allocations must sum to roughly the maximum word limit (or a sensible length if none is given) and never exceed it. Use the applicant's answers to gap questions where provided.

If exemplar_lessons are present, they were selected by the applicant: apply them only as techniques where they fit the prompt, and say how in notes. If they are absent, do not draw on any model essay.

List remaining gaps — information the essay still needs from the applicant.

${HONESTY_RULES}

${EXEMPLAR_RULES}

${UNTRUSTED_DATA_RULE}`,
    user: `${dataBlock(safeJson(brief))}\n\nReturn the outline as JSON matching the schema.`,
  };
}
