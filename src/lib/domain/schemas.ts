import { z } from "zod";
import {
  APPLICATION_CATEGORIES,
  DOCUMENT_TYPES,
  ESSAY_STATUSES,
  ESSAY_TYPES,
  EVIDENCE_CLASSIFICATIONS,
  EXEMPLAR_ASPECTS,
  EXEMPLAR_PROVENANCE,
} from "./constants";
import { ENTRY_SECTIONS, PRIVACY_LEVELS } from "@/lib/library/sections";

// Shared by React Hook Form on the client and by server actions, which re-validate everything.

const text = (max: number) => z.string().trim().max(max, `Must be ${max.toLocaleString()} characters or fewer`);

const optionalUrl = z
  .string()
  .trim()
  .max(2000)
  .refine((v) => v === "" || /^https?:\/\/\S+$/i.test(v), "Enter a full URL starting with http:// or https://");

const optionalDate = z
  .string()
  .trim()
  .refine((v) => v === "" || !Number.isNaN(Date.parse(v)), "Enter a valid date");

const tagList = (maxItems: number, maxLen = 100) => z.array(z.string().trim().min(1).max(maxLen)).max(maxItems);

/** Empty-string-or-integer input from number fields. */
const optionalInt = (min: number, max: number, label: string) =>
  z
    .union([z.number(), z.string()])
    .transform((v) => (v === "" || v === null ? null : Number(v)))
    .refine((v) => v === null || (Number.isInteger(v) && v >= min && v <= max), `${label} must be a whole number between ${min} and ${max.toLocaleString()}`);

/** Converts empty strings to null so optional columns are stored as NULL. */
export function nullify<T extends Record<string, unknown>>(obj: T): { [K in keyof T]: T[K] extends string ? string | null : T[K] } {
  return Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, v === "" ? null : v])) as never;
}

export const writingPreferencesSchema = z.object({
  tone: text(100).optional(),
  formality: text(100).optional(),
  style: text(1000).optional(),
  themes: tagList(15, 200).optional(),
  experiences: text(4000).optional(),
  avoid: text(2000).optional(),
  voice: text(500).optional(),
  instructions: text(4000).optional(),
  spelling: z.enum(["british", "american"]).optional(),
});
export type WritingPreferencesInput = z.infer<typeof writingPreferencesSchema>;

// ---------------------------------------------------------------------------
// Applications (wizard steps)
// ---------------------------------------------------------------------------

export const opportunitySchema = z.object({
  institution: z.string().trim().min(1, "Institution or organisation is required").max(300),
  programme: z.string().trim().min(1, "Programme or scholarship name is required").max(300),
  name: text(300),
  category: z.enum(APPLICATION_CATEGORIES),
  country: text(120),
  official_url: optionalUrl,
  deadline: optionalDate,
  course_description: text(30000),
  reason_for_applying: text(10000),
});
export type OpportunityInput = z.infer<typeof opportunitySchema>;

export const applicationRequirementsSchema = z.object({
  selection_criteria: text(30000),
  official_instructions: text(30000),
});
export type ApplicationRequirementsInput = z.infer<typeof applicationRequirementsSchema>;

export const essayRequirementSchema = z
  .object({
    title: z.string().trim().min(1, "Essay title is required").max(300),
    essay_type: z.enum(ESSAY_TYPES),
    // Exact wording is preserved: only surrounding whitespace is trimmed.
    prompt: z.string().trim().max(20000, "The prompt is too long"),
    min_words: optionalInt(0, 100000, "Minimum word count"),
    max_words: optionalInt(1, 100000, "Maximum word count"),
    required_themes: tagList(20, 300),
    selection_criteria: text(20000),
    required_format: text(5000),
    instructions: text(20000),
    restrictions: text(5000),
  })
  .refine((v) => v.min_words === null || v.max_words === null || v.min_words <= v.max_words, {
    message: "The minimum cannot be greater than the maximum",
    path: ["min_words"],
  });
export type EssayRequirementInput = z.input<typeof essayRequirementSchema>;
export type EssayRequirementValues = z.output<typeof essayRequirementSchema>;

export const requirementItemSchema = z.object({
  kind: z.enum(["requirement", "milestone"]),
  title: z.string().trim().min(1, "Enter a title").max(500),
  details: text(5000),
  due_date: optionalDate,
});
export type RequirementItemInput = z.infer<typeof requirementItemSchema>;

export const essayStatusSchema = z.enum(ESSAY_STATUSES);

// ---------------------------------------------------------------------------
// Profile, evidence and stories
// ---------------------------------------------------------------------------

export const profileSchema = z.object({
  display_name: text(200),
  full_name: text(200),
});
export type ProfileInput = z.infer<typeof profileSchema>;

export const entrySchema = z
  .object({
    section: z.enum(ENTRY_SECTIONS),
    also_in: z.array(z.enum(ENTRY_SECTIONS)).max(ENTRY_SECTIONS.length),
    title: z.string().trim().min(1, "Title is required").max(300),
    summary: text(5000),
    organisation: text(300),
    role: text(300),
    location: text(200),
    period: text(200),
    figures: text(2000),
    links: text(2000),
    context: text(10000),
    challenge: text(10000),
    actions: text(10000),
    outcome: text(10000),
    measurable_impact: text(5000),
    lessons: text(10000),
    motivation: text(10000),
    narrative: text(30000),
    skills: tagList(30),
    related_criteria: tagList(30, 300),
    tags: tagList(30, 60),
    classification: z.enum(EVIDENCE_CLASSIFICATIONS),
    source: text(1000),
    privacy: z.enum(PRIVACY_LEVELS),
  })
  // An entry is never cross-listed into its own section.
  .transform((v) => ({ ...v, also_in: v.also_in.filter((s) => s !== v.section) }));
export type EntryInput = z.input<typeof entrySchema>;

// ---------------------------------------------------------------------------
// Documents and exemplars
// ---------------------------------------------------------------------------

export const documentMetaSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(300),
  doc_type: z.enum(DOCUMENT_TYPES),
  application_id: z.string().uuid().nullable(),
  notes: text(5000),
});
export type DocumentMetaInput = z.infer<typeof documentMetaSchema>;

export const exemplarMetaSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(300),
  essay_category: z.enum(ESSAY_TYPES),
  institution: text(300),
  programme: text(300),
  author_attribution: text(300),
  original_prompt: text(10000),
  original_word_limit: optionalInt(1, 100000, "Word limit"),
  application_year: optionalInt(1900, 2100, "Year"),
  source_url: optionalUrl,
  provenance: z.enum(EXEMPLAR_PROVENANCE),
  notes: text(10000),
  tags: tagList(30, 60),
});
export type ExemplarMetaInput = z.input<typeof exemplarMetaSchema>;
export type ExemplarMetaValues = z.output<typeof exemplarMetaSchema>;

export const exemplarAspectsSchema = z.array(z.enum(EXEMPLAR_ASPECTS)).max(EXEMPLAR_ASPECTS.length);

export const exportSettingsSchema = z.object({
  font: z.enum(["serif", "sans", "mono"]).default("serif"),
  fontSize: z.coerce.number().min(9).max(16).default(12),
  margins: z.enum(["narrow", "normal", "wide"]).default("normal"),
  lineSpacing: z.coerce.number().min(1).max(2.5).default(1.5),
  pageNumbers: z.boolean().default(true),
});
export type ExportSettingsValues = z.output<typeof exportSettingsSchema>;
