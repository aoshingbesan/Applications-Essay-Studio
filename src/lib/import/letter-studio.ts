// Maps Recommendation Letter Studio evidence (its "public.evidence" table) to Story Bank entries.
// Imports are copies: later edits in either app never change the other.

import type { EvidenceClassification } from "@/lib/domain/constants";
import type { EntryInput } from "@/lib/domain/schemas";
import type { EntrySection, Privacy } from "@/lib/library/sections";

/** The Letter Studio evidence columns the import reads. */
export interface LetterStudioEvidence {
  id: string;
  title: string;
  category: string;
  description: string | null;
  period: string | null;
  role: string | null;
  individual_contribution: string | null;
  problem: string | null;
  decisions: string | null;
  outcome: string | null;
  quantified_impact: string | null;
  supporting_url: string | null;
  information_source: string | null;
  verification_status: "user_supplied" | "document_supported" | "needs_verification" | "recommender_confirmed";
}

export const LETTER_STUDIO_EVIDENCE_COLUMNS =
  "id, title, category, description, period, role, individual_contribution, problem, decisions, outcome, quantified_impact, supporting_url, information_source, verification_status";

export const letterStudioSourceRef = (id: string) => `letter-studio:evidence:${id}`;

/** Letter Studio's evidence categories, mapped to the Story Bank section they belong in. */
export const CATEGORY_SECTIONS: Record<string, EntrySection> = {
  academic_work: "education",
  research: "projects_research",
  product_development: "tech",
  technical_work: "tech",
  leadership: "leadership",
  community_impact: "community_development",
  professional_experience: "career",
  awards: "achievements",
  personal_development: "failures_growth",
};

export function sectionForCategory(category: string): EntrySection {
  return CATEGORY_SECTIONS[category] ?? "projects_research";
}

/** Anything flagged for checking in Letter Studio stays flagged here; nothing is upgraded. */
export function mapClassification(v: LetterStudioEvidence["verification_status"]): EvidenceClassification {
  return v === "needs_verification" ? "unverified" : "verified_fact";
}

const join = (...parts: (string | null | undefined)[]) =>
  parts
    .map((p) => p?.trim())
    .filter(Boolean)
    .join("\n\n");

const clip = (s: string, max: number) => (s.length > max ? s.slice(0, max) : s);
const t = (v: string | null | undefined, max: number) => clip(v?.trim() ?? "", max);

export function evidenceToEntry(e: LetterStudioEvidence, privacy: Privacy): EntryInput {
  return {
    section: sectionForCategory(e.category),
    also_in: [],
    title: clip(e.title.trim() || "Imported evidence", 300),
    summary: t(e.description, 5000),
    organisation: "",
    role: t(e.role, 300),
    location: "",
    period: t(e.period, 200),
    figures: t(e.quantified_impact, 2000),
    links: t(e.supporting_url, 2000),
    context: "",
    challenge: t(e.problem, 10000),
    actions: clip(join(e.individual_contribution, e.decisions), 10000),
    outcome: t(e.outcome, 10000),
    measurable_impact: t(e.quantified_impact, 5000),
    lessons: "",
    motivation: "",
    narrative: "",
    skills: [],
    related_criteria: [],
    tags: [e.category.replace(/_/g, " ")],
    classification: mapClassification(e.verification_status),
    source: clip(join("Imported from Recommendation Letter Studio.", e.information_source ? `Source: ${e.information_source}` : null), 1000),
    privacy,
  };
}
