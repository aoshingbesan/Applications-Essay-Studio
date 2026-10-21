// Deterministic fixtures used ONLY when AI_MOCK_RESPONSES=1 outside production (automated
// end-to-end tests). They pass through the same validators as real model output.

function between(text: string, tag: string): string {
  const m = new RegExp(`<${tag}>\\n?([\\s\\S]*?)\\n?</${tag}>`).exec(text);
  return m ? m[1].replace(/\\u003c/g, "<") : "";
}

export function mockOutput(operation: string, user: string): unknown {
  switch (operation) {
    case "prompt_analysis":
      return {
        central_question: "Why this programme, and how has your experience prepared you for it?",
        subquestions: ["What motivates you?", "What evidence shows you are prepared?"],
        word_limit_note: "Stay within the stated maximum.",
        required_themes: ["Leadership"],
        evaluation_criteria: [{ criterion: "Leadership", basis: "stated", explanation: "Listed in the official criteria." }],
        format_restrictions: [],
        priorities: ["Answer the question directly"],
        interpretation_notes: "Test fixture.",
      };
    case "gap_questions":
      return {
        questions: [
          { question: "How many members did the club have when you left?", why: "Quantifies the outcome.", category: "outcome", importance: "critical" },
        ],
      };
    case "evidence_recommendation":
      return {
        recommendations: [{ ref: "S1", reason: "Directly shows leadership.", use_for: "Main example", strength: "strong" }],
        not_recommended: [],
        conflicts: [],
        missing: [],
      };
    case "exemplar_analysis":
      return {
        overview: { purpose: "Persuade the panel", main_argument: "Experience leads to goals", central_narrative: "A formative project", themes: ["Leadership"], approx_word_count: 500, structure_summary: "Four parts" },
        opening: { how_it_begins: "A concrete scene", opening_type: "personal_experience", motivation_effectiveness: "Effective", works_well: ["Specific"], could_improve: ["Faster pivot"] },
        structure: {
          sections: [{ label: "Opening", summary: "Scene", purpose: "Engage", approx_words: 100 }],
          progression: "Past to future",
          balance: [{ component: "Future goals", approx_share_percent: 25, comment: "Adequate" }],
          transitions: "Smooth",
          conclusion_strategy: "Returns to the opening scene",
        },
        evidence: { support_methods: "Examples", contextualisation: "Good", measurable_outcomes: "Some", reflection: "Present", specificity: "High", unsupported_claims: [] },
        alignment: { available: false, note: "No original prompt supplied.", items: [] },
        techniques: {
          tone_voice: "Warm", sentence_variety: "Varied", paragraph_structure: "Clear", specificity: "High", clarity: "High",
          transitions: "Smooth", storytelling: "Strong", argument_development: "Clear", narrative_explanation_balance: "Balanced",
          rhetorical_techniques: [{ technique: "Callback", observation: "Ending echoes the opening" }],
        },
        limitations: { weak_sections: [], overstatement: [], missing_evidence: [], unclear_reasoning: [], non_transferable: [], single_sample_caveat: "One sample only." },
        lessons: [
          { aspect: "opening", lesson: "Open with a specific moment that sets up the central problem.", rationale: "Engages quickly", basis: "observed" },
          { aspect: "conclusion", lesson: "End by linking back to the opening with a concrete next step.", rationale: "Closure", basis: "interpreted" },
        ],
        blueprint: {
          opening_strategy: "A concrete moment",
          structure: [{ section: "Opening", purpose: "Engage", approx_share_percent: 20 }],
          questions_for_applicant: ["What moment made the problem real for you?"],
          evidence_needed: ["An outcome you can quantify"],
          balance_guidance: "Half narrative, half forward-looking",
          weaknesses_to_avoid: ["Listing achievements"],
        },
      };
    case "exemplar_comparison":
      return { shared_techniques: [{ technique: "Concrete opening", exemplars: ["A", "B"], note: "Both" }], differing_approaches: [], recommendations: ["Choose by prompt"], caveats: ["Small sample"] };
    case "blueprint":
      return {
        opening_strategy: "Open with the moment you started the club.",
        structure: [{ section: "Opening", purpose: "Engage", word_allocation: 100 }],
        questions_to_answer: ["What changed because of your leadership?"],
        evidence_needed: ["Membership numbers"],
        balance_guidance: "Balance narrative with reflection.",
        weaknesses_to_avoid: ["Generic claims"],
        lessons_applied: [{ lesson: "Concrete opening", how: "Used for section one" }],
      };
    case "outline":
      return {
        thesis: "Leading a community coding club prepared me to lead larger digital inclusion work.",
        sections: [
          { heading: "Opening", purpose: "Engage", key_points: ["The first session"], evidence_refs: ["S1"], word_allocation: 150, requirements_addressed: ["Leadership"] },
          { heading: "Future", purpose: "Goals", key_points: ["Next steps"], evidence_refs: [], word_allocation: 150, requirements_addressed: ["Career goals"] },
        ],
        gaps: [],
        notes: "Test fixture.",
      };
    case "draft":
      return {
        sections: [
          { heading: "", paragraphs: [{ text: "The first session of the coding club had four students and one borrowed laptop.", evidence_refs: ["S1"] }] },
          { heading: "", paragraphs: [{ text: "This programme would help me turn that small start into a wider digital inclusion initiative.", evidence_refs: [] }] },
        ],
        flags: { unverified_claims: [], missing_information: [], requirements_not_addressed: [], source_conflicts: [], notes: ["Test fixture draft."] },
      };
    case "rewrite": {
      const target = between(user, "text_to_revise").trim() || "Revised text.";
      return { revised: `${target} (revised)`, changes: ["Clarified the wording."], warnings: [] };
    }
    case "critique":
      return { assessment: "Clear but general.", issues: [{ issue: "Generic claim", why: "Lacks evidence", suggestion: "Add a specific example", severity: "optional" }], alternative_structure: [] };
    case "readiness_review":
      return {
        summary: "The draft answers the prompt; one example needs more specific evidence.",
        dimensions: [{ dimension: "prompt_alignment", label: "strong", comment: "Answers the question." }],
        findings: [
          { dimension: "specificity", label: "needs_improvement", severity: "optional", issue: "General closing", why: "Weakens the ending", excerpt: "", requirement: "", suggestion: "Name a concrete next step." },
        ],
      };
    default:
      throw new Error(`No mock fixture for ${operation}`);
  }
}
