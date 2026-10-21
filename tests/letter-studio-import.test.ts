import { describe, expect, it } from "vitest";
import { evidenceToEntry, letterStudioSourceRef, mapClassification, sectionForCategory, type LetterStudioEvidence } from "@/lib/import/letter-studio";
import { entrySchema } from "@/lib/domain/schemas";

const evidence: LetterStudioEvidence = {
  id: "3e000000-0000-4000-8000-000000000001",
  title: "Crop disease detection capstone",
  category: "technical_work",
  description: "Final-year project",
  period: "2023–2024",
  role: "Team lead",
  individual_contribution: "Built the image classifier",
  problem: "Farmers lacked early warning",
  decisions: "Chose a lightweight model for phones",
  outcome: "Piloted with 12 farmers",
  quantified_impact: "87% accuracy on the test set",
  supporting_url: "https://example.org/report",
  information_source: "Capstone report",
  verification_status: "recommender_confirmed",
};

describe("Letter Studio evidence import", () => {
  it("maps evidence to a valid entry in the matching section without inventing anything", () => {
    const entry = evidenceToEntry(evidence, "available");
    const parsed = entrySchema.safeParse(entry);
    expect(parsed.success).toBe(true);
    expect(entry).toMatchObject({
      section: "tech",
      title: "Crop disease detection capstone",
      summary: "Final-year project",
      role: "Team lead",
      challenge: "Farmers lacked early warning",
      actions: "Built the image classifier\n\nChose a lightweight model for phones",
      outcome: "Piloted with 12 farmers",
      measurable_impact: "87% accuracy on the test set",
      period: "2023–2024",
      tags: ["technical work"],
      lessons: "",
      narrative: "",
      privacy: "available",
    });
    expect(entry.source).toContain("Imported from Recommendation Letter Studio.");
  });

  it("maps categories to sections and keeps flagged evidence flagged", () => {
    expect(sectionForCategory("academic_work")).toBe("education");
    expect(sectionForCategory("community_impact")).toBe("community_development");
    expect(sectionForCategory("personal_development")).toBe("failures_growth");
    expect(sectionForCategory("something_new")).toBe("projects_research");
    expect(mapClassification("needs_verification")).toBe("unverified");
    expect(mapClassification("recommender_confirmed")).toBe("verified_fact");
  });

  it("handles sparse evidence and over-long fields", () => {
    const sparse = evidenceToEntry({ ...evidence, title: "  ", description: null, role: null, individual_contribution: null, decisions: null, outcome: null, quantified_impact: null, supporting_url: null, information_source: null, problem: null, period: null, verification_status: "user_supplied" }, "ask");
    expect(entrySchema.safeParse(sparse).success).toBe(true);
    expect(sparse).toMatchObject({ title: "Imported evidence", actions: "", privacy: "ask" });
    expect(entrySchema.safeParse(evidenceToEntry({ ...evidence, description: "x".repeat(20000) }, "available")).success).toBe(true);
  });

  it("uses a stable source reference so repeat imports are detected", () => {
    expect(letterStudioSourceRef(evidence.id)).toBe("letter-studio:evidence:3e000000-0000-4000-8000-000000000001");
  });
});
