// Maps Recommendation Letter Studio evidence (its "public.evidence" table) to Essay Studio stories.
// Imports are copies: later edits in either app never change the other.

import type { StoryVerification } from "@/lib/domain/constants";
import type { StoryInput } from "@/lib/domain/schemas";

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

/** Confirmation in Letter Studio carries over; anything flagged for checking stays flagged. Nothing is upgraded. */
export function mapVerification(v: LetterStudioEvidence["verification_status"]): StoryVerification {
  if (v === "recommender_confirmed" || v === "document_supported") return "verified";
  if (v === "needs_verification") return "needs_confirmation";
  return "self_reported";
}

const join = (...parts: (string | null | undefined)[]) =>
  parts
    .map((p) => p?.trim())
    .filter(Boolean)
    .join("\n\n");

const clip = (s: string, max: number) => (s.length > max ? s.slice(0, max) : s);

export function evidenceToStory(e: LetterStudioEvidence): StoryInput {
  const tag = e.category.replace(/_/g, " ");
  return {
    title: clip(e.title.trim() || "Imported evidence", 300),
    context: clip(e.description?.trim() ?? "", 10000),
    challenge: clip(e.problem?.trim() ?? "", 10000),
    actions: clip(join(e.role ? `Role: ${e.role}` : null, e.individual_contribution, e.decisions), 10000),
    outcome: clip(e.outcome?.trim() ?? "", 10000),
    measurable_impact: clip(e.quantified_impact?.trim() ?? "", 5000),
    lessons: "",
    motivation: "",
    skills: [],
    related_criteria: [],
    supporting_evidence: clip(join("Imported from Recommendation Letter Studio.", e.information_source ? `Source: ${e.information_source}` : null, e.supporting_url), 5000),
    tags: [tag],
    period: clip(e.period?.trim() ?? "", 200),
    verification_status: mapVerification(e.verification_status),
  };
}
