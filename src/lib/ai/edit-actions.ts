// The contextual editing actions offered in the Essay Studio. Shared by the UI and the prompt builder.

/** Editing actions. "revise" actions return a proposed replacement; "critique" actions return analysis only. */
export const EDIT_ACTIONS = {
  clarity: { label: "Improve Clarity", mode: "revise", instruction: "Make the text clearer and easier to follow without changing its meaning." },
  strengthen_argument: { label: "Strengthen Argument", mode: "revise", instruction: "Make the argument more persuasive and logically tighter, using only the evidence available." },
  opening: { label: "Improve Opening", mode: "revise", instruction: "Improve this opening so it engages the reader quickly and leads naturally into the essay's central argument." },
  conclusion: { label: "Improve Conclusion", mode: "revise", instruction: "Improve this conclusion so it resolves the argument and ends on a clear, feasible future direction, without repeating earlier text." },
  specific: { label: "Make More Specific", mode: "revise", instruction: "Replace generic statements with specific detail drawn from the evidence. Where the needed detail is not in the evidence, insert an [ADD: …] placeholder rather than inventing it." },
  repetition: { label: "Reduce Repetition", mode: "revise", instruction: "Remove repeated ideas, phrases and words while keeping every distinct point." },
  transitions: { label: "Improve Transitions", mode: "revise", instruction: "Improve the transitions so each idea connects logically to the next." },
  concise: { label: "Make More Concise", mode: "revise", instruction: "Make the text more concise — aim for about 20–30% fewer words — while keeping every substantive point." },
  expand_evidence: { label: "Expand with Relevant Evidence", mode: "revise", instruction: "Develop the text using relevant evidence from the application data. Use only facts present there; do not add unsupported achievements." },
  academic_tone: { label: "Improve Academic Tone", mode: "revise", instruction: "Adjust the register to a precise, academic tone while keeping the applicant's voice and first person." },
  narrative_flow: { label: "Improve Narrative Flow", mode: "revise", instruction: "Improve the narrative flow and pacing so the story reads naturally." },
  programme_fit: { label: "Strengthen Programme Fit", mode: "revise", instruction: "Strengthen the connection to this specific programme using the programme description and requirements supplied. Do not invent programme features, modules or faculty names that are not in the data." },
  development_impact: { label: "Strengthen Development Impact", mode: "revise", instruction: "Strengthen the account of development impact: the problem, the applicant's role, and feasible, measurable future outcomes. Keep demonstrated past impact separate from projected future impact." },
  leadership_evidence: { label: "Improve Leadership Evidence", mode: "revise", instruction: "Show leadership through concrete actions, decisions and outcomes from the evidence rather than assertion." },
  word_limit: { label: "Rewrite Within Word Limit", mode: "revise", instruction: "Rewrite so the text fits the target word count given below while keeping the most important content." },
  apply_lessons: { label: "Apply Selected Exemplar Lessons", mode: "revise", instruction: "Revise the text applying the selected exemplar lessons as techniques only. Do not imitate any exemplar's wording or borrow its content." },
  critique: { label: "Critique This Paragraph", mode: "critique", instruction: "Critique this text candidly: what works, what is weak, and how to improve it." },
  explain_weak: { label: "Explain Why This Section Is Weak", mode: "critique", instruction: "Explain specifically why this section is weak against the prompt and requirements, and what would fix each weakness." },
  alternative_structure: { label: "Suggest an Alternative Structure", mode: "critique", instruction: "Suggest a different structure for the essay that would answer the prompt more effectively, explaining the purpose of each section. Fill alternative_structure." },
} as const;
export type EditAction = keyof typeof EDIT_ACTIONS;
export const EDIT_ACTION_KEYS = Object.keys(EDIT_ACTIONS) as [EditAction, ...EditAction[]];
