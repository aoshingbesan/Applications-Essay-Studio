import { describe, expect, it } from "vitest";
import { evidenceToStory, letterStudioSourceRef, mapVerification, type LetterStudioEvidence } from "@/lib/import/letter-studio";
import { storySchema } from "@/lib/domain/schemas";

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
  it("maps evidence to a valid story without inventing anything", () => {
    const story = evidenceToStory(evidence);
    expect(storySchema.safeParse(story).success).toBe(true);
    expect(story).toMatchObject({
      title: "Crop disease detection capstone",
      context: "Final-year project",
      challenge: "Farmers lacked early warning",
      actions: "Role: Team lead\n\nBuilt the image classifier\n\nChose a lightweight model for phones",
      outcome: "Piloted with 12 farmers",
      measurable_impact: "87% accuracy on the test set",
      period: "2023–2024",
      tags: ["technical work"],
      lessons: "",
      motivation: "",
    });
    expect(story.supporting_evidence).toContain("Imported from Recommendation Letter Studio.");
  });

  it("carries verification over conservatively", () => {
    expect(mapVerification("recommender_confirmed")).toBe("verified");
    expect(mapVerification("document_supported")).toBe("verified");
    expect(mapVerification("needs_verification")).toBe("needs_confirmation");
    expect(mapVerification("user_supplied")).toBe("self_reported");
  });

  it("handles sparse evidence and over-long fields", () => {
    const sparse = evidenceToStory({ ...evidence, title: "  ", description: null, role: null, individual_contribution: null, decisions: null, outcome: null, quantified_impact: null, supporting_url: null, information_source: null, problem: null, period: null, verification_status: "user_supplied" });
    expect(storySchema.safeParse(sparse).success).toBe(true);
    expect(sparse).toMatchObject({ title: "Imported evidence", actions: "", verification_status: "self_reported" });
    expect(storySchema.safeParse(evidenceToStory({ ...evidence, description: "x".repeat(20000) })).success).toBe(true);
  });

  it("uses a stable source reference so repeat imports are detected", () => {
    expect(letterStudioSourceRef(evidence.id)).toBe("letter-studio:evidence:3e000000-0000-4000-8000-000000000001");
  });
});
