// Enumerations shared by the database (check constraints), Zod schemas and the UI.
// Keep these in sync with supabase/migrations.

export const APPLICATION_CATEGORIES = [
  "undergraduate_admission",
  "masters_admission",
  "phd_admission",
  "scholarship",
  "fellowship",
  "research_programme",
  "leadership_programme",
  "other",
] as const;
export type ApplicationCategory = (typeof APPLICATION_CATEGORIES)[number];

export const APPLICATION_CATEGORY_LABELS: Record<ApplicationCategory, string> = {
  undergraduate_admission: "Undergraduate admission",
  masters_admission: "Master's admission",
  phd_admission: "PhD admission",
  scholarship: "Scholarship",
  fellowship: "Fellowship",
  research_programme: "Research programme",
  leadership_programme: "Leadership or development programme",
  other: "Other",
};

export const ESSAY_STATUSES = ["not_started", "in_progress", "needs_review", "ready_to_submit", "submitted"] as const;
export type EssayStatus = (typeof ESSAY_STATUSES)[number];

export const ESSAY_STATUS_LABELS: Record<EssayStatus, string> = {
  not_started: "Not Started",
  in_progress: "In Progress",
  needs_review: "Needs Review",
  ready_to_submit: "Ready to Submit",
  submitted: "Submitted",
};

export const ESSAY_TYPES = [
  "statement_of_purpose",
  "personal_statement",
  "motivation_letter",
  "scholarship_essay",
  "development_impact",
  "leadership_essay",
  "career_goals",
  "fellowship_application",
  "research_statement",
  "research_proposal",
  "study_plan",
  "short_answer",
  "custom",
] as const;
export type EssayType = (typeof ESSAY_TYPES)[number];

export const ESSAY_TYPE_LABELS: Record<EssayType, string> = {
  statement_of_purpose: "Statement of Purpose",
  personal_statement: "Personal Statement",
  motivation_letter: "Motivation Letter",
  scholarship_essay: "Scholarship Essay",
  development_impact: "Development Impact Statement",
  leadership_essay: "Leadership Essay",
  career_goals: "Career Goals Essay",
  fellowship_application: "Fellowship Application",
  research_statement: "Research Statement",
  research_proposal: "Research Proposal",
  study_plan: "Study Plan",
  short_answer: "Short-Answer Question",
  custom: "Custom Essay Type",
};

/**
 * Category guidance used in prompts and shown to the user. These are writing guidelines, not
 * templates: the official instructions for the actual application always take priority.
 */
export const ESSAY_TYPE_GUIDANCE: Record<EssayType, string> = {
  statement_of_purpose:
    "Emphasise academic preparation, intellectual interests, relevant experience, specific programme fit and clear future goals.",
  personal_statement:
    "Emphasise personal motivation, formative experiences, genuine reflection and the applicant's authentic voice.",
  motivation_letter: "Emphasise motivation, relevant qualifications, programme fit and the contribution the applicant can make.",
  scholarship_essay:
    "Emphasise alignment with the stated selection criteria, relevant evidence, leadership, feasibility and concrete future plans.",
  development_impact:
    "Emphasise the development problem, contextual evidence, the proposed response, feasibility, potential outcomes and how they would be measured. Keep demonstrated past impact clearly separate from projected future impact.",
  leadership_essay:
    "Emphasise concrete actions, decisions, challenges, collaboration, outcomes and lessons learned. Show leadership through what the applicant did rather than by asserting it.",
  career_goals:
    "Emphasise a credible short- and long-term trajectory, how past experience leads to it, and how this opportunity is a necessary step.",
  fellowship_application:
    "Emphasise purpose, track record, the specific contribution the fellowship enables and how it fits the fellowship's mission.",
  research_statement:
    "Distinguish existing evidence, research questions, methods, academic fit, limitations and anticipated contributions.",
  research_proposal:
    "Set out the problem, the gap in existing work, research questions, methods, feasibility, limitations and expected contribution. Do not present anticipated findings as results.",
  study_plan: "Set out what will be studied, why, how it builds on prior learning, and how it serves concrete future goals.",
  short_answer: "Answer the question directly and early. Use one well-chosen example; every sentence must earn its place.",
  custom: "Follow the official prompt closely; structure the answer around its explicit questions.",
};

export const EVIDENCE_SECTIONS = [
  "background",
  "education",
  "academic_achievement",
  "work_experience",
  "leadership",
  "volunteering",
  "projects_research",
  "awards",
  "skills",
  "challenges",
  "career_goals",
  "long_term_ambitions",
  "impact_goals",
  "motivations",
] as const;
export type EvidenceSection = (typeof EVIDENCE_SECTIONS)[number];

export const EVIDENCE_SECTION_LABELS: Record<EvidenceSection, string> = {
  background: "Personal background",
  education: "Education",
  academic_achievement: "Academic achievements",
  work_experience: "Work experience",
  leadership: "Leadership experience",
  volunteering: "Volunteer activities",
  projects_research: "Projects and research",
  awards: "Awards and scholarships",
  skills: "Skills and qualifications",
  challenges: "Challenges and formative experiences",
  career_goals: "Career goals",
  long_term_ambitions: "Long-term ambitions",
  impact_goals: "Social and development impact goals",
  motivations: "Motivations",
};

/** Sections that describe the future: entries here are aspirations, never accomplishments. */
export const FUTURE_SECTIONS: readonly EvidenceSection[] = ["career_goals", "long_term_ambitions", "impact_goals"];

export const EVIDENCE_CLASSIFICATIONS = [
  "verified_fact",
  "quantified_achievement",
  "personal_reflection",
  "goal_aspiration",
  "unverified",
] as const;
export type EvidenceClassification = (typeof EVIDENCE_CLASSIFICATIONS)[number];

export const CLASSIFICATION_LABELS: Record<EvidenceClassification, string> = {
  verified_fact: "Verified Fact",
  quantified_achievement: "Quantified Achievement",
  personal_reflection: "Personal Reflection",
  goal_aspiration: "Goal or Aspiration",
  unverified: "Unverified — Needs Confirmation",
};

export const STORY_VERIFICATION = ["verified", "self_reported", "needs_confirmation"] as const;
export type StoryVerification = (typeof STORY_VERIFICATION)[number];

export const STORY_VERIFICATION_LABELS: Record<StoryVerification, string> = {
  verified: "Verified",
  self_reported: "Self-reported",
  needs_confirmation: "Needs confirmation",
};

export const EXEMPLAR_PROVENANCE = ["official_sample", "uploader_reported", "independently_verified", "unknown"] as const;
export type ExemplarProvenance = (typeof EXEMPLAR_PROVENANCE)[number];

export const PROVENANCE_LABELS: Record<ExemplarProvenance, string> = {
  official_sample: "Officially Published Sample",
  uploader_reported: "Success Reported by Uploader",
  independently_verified: "Success Independently Verified",
  unknown: "Success Unknown",
};

export const PROVENANCE_DESCRIPTIONS: Record<ExemplarProvenance, string> = {
  official_sample: "Published by the institution or programme as an example.",
  uploader_reported: "You (or the person who shared it) report that it was successful. Not independently confirmed.",
  independently_verified: "You have confirmed the outcome from a reliable source.",
  unknown: "Whether this essay was successful is not known.",
};

export const DOCUMENT_TYPES = [
  "cv",
  "research_proposal",
  "transcript",
  "certificate",
  "programme_description",
  "scholarship_guidance",
  "previous_statement",
  "project_documentation",
  "official_instructions",
  "other",
] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  cv: "CV or résumé",
  research_proposal: "Research proposal",
  transcript: "Academic transcript",
  certificate: "Certificate",
  programme_description: "Programme description",
  scholarship_guidance: "Scholarship guidance",
  previous_statement: "Previous personal statement",
  project_documentation: "Project documentation",
  official_instructions: "Official instructions",
  other: "Other",
};

export const EXTRACTION_STATUSES = ["pending", "extracted", "needs_ocr", "unsupported", "failed"] as const;
export type ExtractionStatus = (typeof EXTRACTION_STATUSES)[number];

export const EXTRACTION_LABELS: Record<ExtractionStatus, string> = {
  pending: "Processing",
  extracted: "Text extracted",
  needs_ocr: "Scanned — no readable text",
  unsupported: "Text not extractable",
  failed: "Extraction failed",
};

export const EXEMPLAR_ASPECTS = ["structure", "opening", "evidence", "narrative", "tone", "conclusion"] as const;
export type ExemplarAspect = (typeof EXEMPLAR_ASPECTS)[number];

export const EXEMPLAR_ASPECT_LABELS: Record<ExemplarAspect, string> = {
  structure: "Structural approach",
  opening: "Opening technique",
  evidence: "Evidence strategy",
  narrative: "Narrative progression",
  tone: "Tone and formality",
  conclusion: "Conclusion strategy",
};

export const TONES = ["warm", "confident", "reflective", "formal", "direct", "understated"] as const;
export const FORMALITY_LEVELS = ["conversational", "balanced", "formal", "academic"] as const;

// Uploads go straight to private storage; the bucket enforces the same limits.
export const UPLOAD_MAX_BYTES = 10 * 1024 * 1024;
export const DOCUMENT_MIME_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
] as const;
export const DOCUMENT_EXTENSIONS = [".pdf", ".docx", ".txt"] as const;
export const STORAGE_BUCKET = "essay-files";

/** Text-length limits for what extracted documents may contribute to an AI prompt. */
export const MAX_DOCUMENT_EXCERPT_CHARS = 6000;
