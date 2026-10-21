import { describe, expect, it } from "vitest";
import {
  draftValidator,
  exemplarReportValidator,
  outlineValidator,
  readinessValidator,
  rewriteValidator,
  toOutputSchema,
  promptAnalysisValidator,
  gapQuestionsValidator,
  evidenceRecommendationValidator,
  exemplarComparisonValidator,
  blueprintValidator,
  critiqueValidator,
} from "@/lib/ai/schemas";
import { validateOutput, AiError } from "@/lib/ai/client";
import { mockOutput } from "@/lib/ai/mock";

const ALL = {
  prompt_analysis: promptAnalysisValidator,
  gap_questions: gapQuestionsValidator,
  evidence_recommendation: evidenceRecommendationValidator,
  exemplar_analysis: exemplarReportValidator,
  exemplar_comparison: exemplarComparisonValidator,
  blueprint: blueprintValidator,
  outline: outlineValidator,
  draft: draftValidator,
  rewrite: rewriteValidator,
  critique: critiqueValidator,
  readiness_review: readinessValidator,
};

describe("AI response validation", () => {
  it("accepts well-formed output for every operation", () => {
    for (const [op, validator] of Object.entries(ALL)) {
      expect(() => validateOutput(validator as never, JSON.stringify(mockOutput(op, "<text_to_revise>\nHello\n</text_to_revise>"))), op).not.toThrow();
    }
  });

  it("rejects non-JSON as a retryable invalid-output error", () => {
    try {
      validateOutput(rewriteValidator, "Sure! Here is your essay:");
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(AiError);
      expect((e as AiError).code).toBe("invalid_output");
      expect((e as AiError).retryable).toBe(true);
    }
  });

  it("rejects output with missing or malformed parts", () => {
    expect(() => validateOutput(draftValidator, JSON.stringify({ sections: [] }))).toThrow(AiError);
    expect(() => validateOutput(draftValidator, JSON.stringify({ sections: [{ heading: "", paragraphs: [{ text: "", evidence_refs: [] }] }], flags: {} }))).toThrow(AiError);
    expect(() => validateOutput(outlineValidator, JSON.stringify({ thesis: "x", sections: [], gaps: [], notes: "" }))).toThrow(AiError);
    expect(() => validateOutput(rewriteValidator, JSON.stringify({ revised: "", changes: [], warnings: [] }))).toThrow(AiError);
    const badLabel = { summary: "", dimensions: [{ dimension: "prompt_alignment", label: "excellent", comment: "" }], findings: [] };
    expect(() => validateOutput(readinessValidator, JSON.stringify(badLabel))).toThrow(AiError);
  });

  it("produces structured-output schemas without unsupported keywords", () => {
    for (const validator of Object.values(ALL)) {
      const json = JSON.stringify(toOutputSchema(validator as never));
      expect(json).not.toMatch(/"\$schema"|"minimum"|"maximum"|"maxItems"|"minLength"/);
      expect(json).toContain('"additionalProperties":false');
    }
    const outline = toOutputSchema(outlineValidator) as { properties: { sections: { minItems?: number } } };
    expect(outline.properties.sections.minItems).toBe(1);
  });
});
