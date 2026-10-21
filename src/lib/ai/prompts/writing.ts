// Draft generation, contextual editing, critique and readiness review.

import { safeJson } from "../context";
import { dataBlock, EXEMPLAR_RULES, HONESTY_RULES, UNTRUSTED_DATA_RULE, VOICE_RULES } from "./shared";
import { EDIT_ACTIONS, type EditAction } from "../edit-actions";

export { EDIT_ACTIONS, EDIT_ACTION_KEYS, type EditAction } from "../edit-actions";

export const DRAFT_VERSION = "draft-2026-10-v1";
export const REWRITE_VERSION = "rewrite-2026-10-v1";
export const CRITIQUE_VERSION = "critique-2026-10-v1";
export const READINESS_VERSION = "readiness-2026-10-v1";

const WRITER = `You are an expert application-essay writer drafting on behalf of an applicant, from their own evidence, for them to edit and own. The essay must be original and must sound like a thoughtful person, not a template.`;

export function draftPrompt(brief: Record<string, unknown>, options: { includeHeadings: boolean; instructions: string }) {
  return {
    system: `${WRITER}

Write the essay following the approved outline: one section per outline section, in order. The outline names evidence by title ("Story: …", "Profile: …", "Document: …"); use the matching items in the data. Answer the exact prompt directly. Stay within the word limit — aim for 90–100% of the maximum when one is given and never exceed it; respect any minimum. ${options.includeHeadings ? "Give each section a short heading." : "Essays of this kind normally have no headings: set every section heading to an empty string."}

For each paragraph, list the evidence refs (S…, E…, D…) whose facts it uses; leave the list empty for paragraphs of pure reflection or argument. In flags, report: claims you marked [CONFIRM: …] or that rest on unverified items; information you marked [ADD: …]; prompt requirements the draft does not fully address; any conflicts between sources; and notes for the applicant.

${VOICE_RULES}

${HONESTY_RULES}

${EXEMPLAR_RULES}

${UNTRUSTED_DATA_RULE}`,
    user: `${dataBlock(safeJson(brief))}${options.instructions ? `\n\nApplicant's additional instruction for this draft (follow it unless it conflicts with the factual-integrity rules): ${safeJson(options.instructions)}` : ""}\n\nReturn the essay as JSON matching the schema.`,
  };
}

export function rewritePrompt(
  brief: Record<string, unknown>,
  input: { action: EditAction; target: string; essayText: string; scope: "selection" | "essay"; targetWords?: number; instruction?: string },
) {
  const a = EDIT_ACTIONS[input.action];
  return {
    system: `${WRITER}

You are revising ${input.scope === "selection" ? "a selected passage of" : "the whole of"} the applicant's essay. Task: ${a.instruction}${input.targetWords ? ` Target length: about ${input.targetWords} words.` : ""}

Preserve the intended meaning unless the task explicitly asks you to change it. ${input.scope === "selection" ? "Return only the replacement for the selected passage in revised — it must fit back into the surrounding essay — keeping paragraph breaks as blank lines." : "Return the full revised essay in revised, with paragraphs separated by blank lines."} In changes, explain the most important changes in a few short bullet-style sentences. In warnings, note anything the applicant must check, such as placeholders you added or claims you could not support.

${VOICE_RULES}

${HONESTY_RULES}

${EXEMPLAR_RULES}

${UNTRUSTED_DATA_RULE}`,
    user: `${dataBlock(safeJson({ ...brief, current_essay: input.scope === "selection" ? input.essayText : undefined }))}

<text_to_revise>
${input.target.replace(/</g, "\\u003c")}
</text_to_revise>${input.instruction ? `\n\nApplicant's extra instruction (follow it unless it conflicts with the factual-integrity rules): ${safeJson(input.instruction)}` : ""}

Return JSON matching the schema.`,
  };
}

export function critiquePrompt(brief: Record<string, unknown>, input: { action: EditAction; target: string; essayText: string }) {
  const a = EDIT_ACTIONS[input.action];
  return {
    system: `You are a candid, constructive application-essay reviewer. ${a.instruction} Judge the text against the official prompt and requirements first; writing style preferences come second. Mark an issue "critical" only when it would materially weaken the application. Leave alternative_structure empty unless you are asked for one. Do not rewrite the essay.

${UNTRUSTED_DATA_RULE}`,
    user: `${dataBlock(safeJson({ ...brief, full_essay: input.essayText }))}

<text_to_review>
${input.target.replace(/</g, "\\u003c")}
</text_to_review>

Return JSON matching the schema.`,
  };
}

export function readinessPrompt(brief: Record<string, unknown>, essayText: string, wordCount: number) {
  return {
    system: `You are an exacting reviewer checking whether an application essay is ready to submit. Evaluate the draft against the official prompt, requirements and selection criteria supplied — not against any model essay's style.

Assess every dimension in the schema: prompt alignment, coverage of required themes, selection-criteria alignment, strength of evidence, specificity, authenticity, logical structure, clarity, repetition, programme fit, feasibility of future goals, unsupported claims, word-count compliance and missing requirements. Label each "strong", "needs_improvement" or "missing_evidence".

Then list concrete findings. For each: the issue, why it matters, an exact short excerpt from the draft (or an empty string if the issue is an absence), the requirement or criterion it relates to (or an empty string), a specific suggested improvement, and whether it is "critical" (should be fixed before submission) or "optional". Compare factual claims with the supplied evidence: anything not supported there is an unsupported claim. Unresolved [ADD: …] or [CONFIRM: …] placeholders are always critical.

These labels describe the draft against its requirements; they do not predict admission or award decisions, and you must not suggest that they do.

${UNTRUSTED_DATA_RULE}`,
    user: `${dataBlock(safeJson({ ...brief, draft_word_count: wordCount }))}

<draft>
${essayText.replace(/</g, "\\u003c")}
</draft>

Return JSON matching the schema.`,
  };
}
