import { z } from "zod";
import { EXEMPLAR_ASPECTS } from "@/lib/domain/constants";

// Model output validators. Each one is also converted to the JSON schema sent as the
// structured-output format (see toOutputSchema), so the two can never drift apart.
// Every output is validated here before it is stored or shown.

const str = z.string();
const strs = z.array(z.string());
/** Short references to context items, e.g. "S1" (story), "E2" (profile evidence), "D1" (document). */
const refs = z.array(z.string());

// ---------------------------------------------------------------------------
// Prompt analysis, gaps and evidence
// ---------------------------------------------------------------------------

export const promptAnalysisValidator = z.object({
  central_question: str,
  subquestions: strs,
  word_limit_note: str,
  required_themes: strs,
  evaluation_criteria: z.array(
    z.object({
      criterion: str,
      // "stated" = appears in the official text supplied; "inferred" = an interpretation, labelled as such.
      basis: z.enum(["stated", "inferred"]),
      explanation: str,
    }),
  ),
  format_restrictions: strs,
  priorities: strs,
  interpretation_notes: str,
});
export type PromptAnalysis = z.infer<typeof promptAnalysisValidator>;

export const GAP_CATEGORIES = ["fact", "experience", "motivation", "outcome", "programme_fit", "other"] as const;

export const gapQuestionsValidator = z.object({
  questions: z.array(
    z.object({
      question: str,
      why: str,
      category: z.enum(GAP_CATEGORIES),
      importance: z.enum(["critical", "helpful"]),
    }),
  ),
});
export interface GapQuestion {
  id: string;
  question: string;
  why: string;
  category: (typeof GAP_CATEGORIES)[number];
  importance: "critical" | "helpful";
  answer: string;
}

export const evidenceRecommendationValidator = z.object({
  recommendations: z.array(
    z.object({
      ref: str,
      reason: str,
      use_for: str,
      strength: z.enum(["strong", "moderate", "weak"]),
    }),
  ),
  not_recommended: z.array(z.object({ ref: str, reason: str })),
  conflicts: z.array(z.object({ description: str, refs })),
  missing: strs,
});
export type EvidenceRecommendation = z.infer<typeof evidenceRecommendationValidator>;

// ---------------------------------------------------------------------------
// Exemplar analysis, comparison and blueprint
// ---------------------------------------------------------------------------

const basis = z.enum(["observed", "interpreted", "recommended"]);

export const exemplarReportValidator = z.object({
  overview: z.object({
    purpose: str,
    main_argument: str,
    central_narrative: str,
    themes: strs,
    approx_word_count: z.number().int(),
    structure_summary: str,
  }),
  opening: z.object({
    how_it_begins: str,
    opening_type: z.enum(["personal_experience", "problem", "intellectual_interest", "direct_argument", "other"]),
    motivation_effectiveness: str,
    works_well: strs,
    could_improve: strs,
  }),
  structure: z.object({
    sections: z.array(z.object({ label: str, summary: str, purpose: str, approx_words: z.number().int() })),
    progression: str,
    balance: z.array(z.object({ component: str, approx_share_percent: z.number().int(), comment: str })),
    transitions: str,
    conclusion_strategy: str,
  }),
  evidence: z.object({
    support_methods: str,
    contextualisation: str,
    measurable_outcomes: str,
    reflection: str,
    specificity: str,
    unsupported_claims: strs,
  }),
  alignment: z.object({
    available: z.boolean(),
    note: str,
    items: z.array(z.object({ requirement: str, how_addressed: str, evidence: str, gaps: str })),
  }),
  techniques: z.object({
    tone_voice: str,
    sentence_variety: str,
    paragraph_structure: str,
    specificity: str,
    clarity: str,
    transitions: str,
    storytelling: str,
    argument_development: str,
    narrative_explanation_balance: str,
    rhetorical_techniques: z.array(z.object({ technique: str, observation: str })),
  }),
  limitations: z.object({
    weak_sections: strs,
    overstatement: strs,
    missing_evidence: strs,
    unclear_reasoning: strs,
    non_transferable: strs,
    single_sample_caveat: str,
  }),
  lessons: z.array(
    z.object({
      aspect: z.enum([...EXEMPLAR_ASPECTS, "general"]),
      lesson: str,
      rationale: str,
      basis,
    }),
  ),
  blueprint: z.object({
    opening_strategy: str,
    structure: z.array(z.object({ section: str, purpose: str, approx_share_percent: z.number().int() })),
    questions_for_applicant: strs,
    evidence_needed: strs,
    balance_guidance: str,
    weaknesses_to_avoid: strs,
  }),
});
export type ExemplarReport = z.infer<typeof exemplarReportValidator>;

export const exemplarComparisonValidator = z.object({
  shared_techniques: z.array(z.object({ technique: str, exemplars: strs, note: str })),
  differing_approaches: z.array(
    z.object({ dimension: str, approaches: z.array(z.object({ exemplar: str, approach: str })) }),
  ),
  recommendations: strs,
  caveats: strs,
});
export type ExemplarComparison = z.infer<typeof exemplarComparisonValidator>;

export const blueprintValidator = z.object({
  opening_strategy: str,
  structure: z.array(z.object({ section: str, purpose: str, word_allocation: z.number().int() })),
  questions_to_answer: strs,
  evidence_needed: strs,
  balance_guidance: str,
  weaknesses_to_avoid: strs,
  lessons_applied: z.array(z.object({ lesson: str, how: str })),
});
export type Blueprint = z.infer<typeof blueprintValidator>;

// ---------------------------------------------------------------------------
// Outline and draft
// ---------------------------------------------------------------------------

export const outlineValidator = z.object({
  thesis: str,
  sections: z
    .array(
      z.object({
        heading: str,
        purpose: str,
        key_points: strs,
        evidence_refs: refs,
        word_allocation: z.number().int(),
        requirements_addressed: strs,
      }),
    )
    .min(1),
  gaps: strs,
  notes: str,
});
export type Outline = z.infer<typeof outlineValidator>;

export const draftValidator = z.object({
  sections: z
    .array(
      z.object({
        heading: str,
        paragraphs: z.array(z.object({ text: z.string().min(1), evidence_refs: refs })).min(1),
      }),
    )
    .min(1),
  flags: z.object({
    unverified_claims: strs,
    missing_information: strs,
    requirements_not_addressed: strs,
    source_conflicts: strs,
    notes: strs,
  }),
});
export type DraftOutput = z.infer<typeof draftValidator>;

// ---------------------------------------------------------------------------
// Editing, critique and review
// ---------------------------------------------------------------------------

export const rewriteValidator = z.object({
  revised: z.string().min(1),
  changes: strs,
  warnings: strs,
});
export type RewriteOutput = z.infer<typeof rewriteValidator>;

export const critiqueValidator = z.object({
  assessment: str,
  issues: z.array(z.object({ issue: str, why: str, suggestion: str, severity: z.enum(["critical", "optional"]) })),
  alternative_structure: z.array(z.object({ section: str, purpose: str })),
});
export type CritiqueOutput = z.infer<typeof critiqueValidator>;

export const REVIEW_DIMENSIONS = [
  "prompt_alignment",
  "required_themes",
  "selection_criteria",
  "evidence_strength",
  "specificity",
  "authenticity",
  "structure",
  "clarity",
  "repetition",
  "programme_fit",
  "feasibility",
  "unsupported_claims",
  "word_count",
  "missing_requirements",
] as const;
export type ReviewDimension = (typeof REVIEW_DIMENSIONS)[number];

const label = z.enum(["strong", "needs_improvement", "missing_evidence"]);

export const readinessValidator = z.object({
  summary: str,
  dimensions: z.array(z.object({ dimension: z.enum(REVIEW_DIMENSIONS), label, comment: str })),
  findings: z.array(
    z.object({
      dimension: z.enum(REVIEW_DIMENSIONS),
      label,
      severity: z.enum(["critical", "optional"]),
      issue: str,
      why: str,
      excerpt: str,
      requirement: str,
      suggestion: str,
    }),
  ),
});
export type ReadinessOutput = z.infer<typeof readinessValidator>;

// ---------------------------------------------------------------------------
// JSON schema for structured outputs
// ---------------------------------------------------------------------------

// Keywords the structured-output format does not accept. Zod still enforces them afterwards.
const UNSUPPORTED = new Set(["$schema", "minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum", "minLength", "maxLength", "pattern", "format", "maxItems"]);

function strip(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(strip);
  if (typeof node !== "object" || node === null) return node;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(node)) {
    if (UNSUPPORTED.has(k)) continue;
    if (k === "minItems" && typeof v === "number" && v > 1) continue;
    out[k] = strip(v);
  }
  return out;
}

/** The structured-output JSON schema for a validator. */
export function toOutputSchema(validator: z.ZodType): Record<string, unknown> {
  return strip(z.toJSONSchema(validator, { io: "output" })) as Record<string, unknown>;
}
