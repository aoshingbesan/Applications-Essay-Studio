import type {
  ApplicationCategory,
  DocumentType,
  EssayStatus,
  EssayType,
  EvidenceClassification,
  ExemplarAspect,
  ExemplarProvenance,
  ExtractionStatus,
} from "./constants";
import type { EntrySection, Privacy } from "@/lib/library/sections";
import type { EssayDoc } from "@/lib/essay/doc";
import type { ExemplarReport, GapQuestion, Outline, PromptAnalysis, Blueprint } from "@/lib/ai/schemas";

export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string; code?: "unauthenticated" | "not_found" | "validation" | "conflict" | "rate_limited" | "unavailable" };

export interface WritingPreferences {
  tone?: string;
  formality?: string;
  style?: string;
  themes?: string[];
  experiences?: string;
  avoid?: string;
  voice?: string;
  instructions?: string;
  spelling?: "british" | "american";
}

export interface ExportSettings {
  font?: "serif" | "sans" | "mono";
  fontSize?: number;
  margins?: "narrow" | "normal" | "wide";
  lineSpacing?: number;
  pageNumbers?: boolean;
}

export interface Profile {
  id: string;
  display_name: string | null;
  full_name: string | null;
  writing_preferences: WritingPreferences;
  export_settings: ExportSettings;
  ai_enabled: boolean;
}

export interface Application {
  id: string;
  user_id: string;
  name: string;
  institution: string;
  programme: string;
  category: ApplicationCategory;
  country: string | null;
  official_url: string | null;
  deadline: string | null;
  course_description: string | null;
  reason_for_applying: string | null;
  selection_criteria: string | null;
  official_instructions: string | null;
  writing_preferences: WritingPreferences;
  notes: string | null;
  setup_step: number;
  setup_completed_at: string | null;
  submitted_at: string | null;
  archived_at: string | null;
  duplicated_from: string | null;
  created_at: string;
  updated_at: string;
}

export interface ApplicationRequirement {
  id: string;
  application_id: string;
  kind: "requirement" | "milestone";
  title: string;
  details: string | null;
  due_date: string | null;
  completed_at: string | null;
  position: number;
}

export interface SupportingDocument {
  id: string;
  user_id: string;
  application_id: string | null;
  title: string;
  doc_type: DocumentType;
  file_path: string | null;
  file_name: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  content_sha256: string | null;
  extraction_status: ExtractionStatus;
  extraction_error: string | null;
  extracted_text: string | null;
  page_count: number | null;
  word_count: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

/** One record in the Story Bank library: structured facts, an optional story and a narrative. */
export interface LibraryEntry {
  id: string;
  user_id: string;
  section: EntrySection;
  also_in: EntrySection[];
  title: string;
  summary: string | null;
  organisation: string | null;
  role: string | null;
  location: string | null;
  period: string | null;
  figures: string | null;
  links: string | null;
  context: string | null;
  challenge: string | null;
  actions: string | null;
  outcome: string | null;
  measurable_impact: string | null;
  lessons: string | null;
  motivation: string | null;
  narrative: string | null;
  skills: string[];
  related_criteria: string[];
  tags: string[];
  classification: EvidenceClassification;
  source: string | null;
  privacy: Privacy;
  source_ref: string | null;
  position: number;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Exemplar {
  id: string;
  user_id: string;
  title: string;
  essay_category: EssayType;
  institution: string | null;
  programme: string | null;
  author_attribution: string | null;
  original_prompt: string | null;
  original_word_limit: number | null;
  application_year: number | null;
  source_url: string | null;
  provenance: ExemplarProvenance;
  notes: string | null;
  tags: string[];
  file_path: string | null;
  file_name: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  source_text: string;
  source_hash: string | null;
  word_count: number;
  extraction_status: ExtractionStatus;
  extraction_error: string | null;
  permission_confirmed_at: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

export type AnalysisStatus = "queued" | "running" | "complete" | "failed";

export interface ExemplarAnalysis {
  id: string;
  exemplar_id: string;
  status: AnalysisStatus;
  source_hash: string;
  spec_version: string;
  prompt_version: string;
  model: string | null;
  report: ExemplarReport | null;
  error_message: string | null;
  job_id: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

export interface SelectedLesson {
  id: string;
  exemplar_id: string;
  analysis_id: string | null;
  essay_id: string | null;
  application_id: string | null;
  aspect: ExemplarAspect | "lesson";
  lesson_key: string;
  content: string;
  created_at: string;
}

export interface Essay {
  id: string;
  user_id: string;
  application_id: string;
  title: string;
  essay_type: EssayType;
  prompt: string;
  min_words: number | null;
  max_words: number | null;
  required_themes: string[];
  selection_criteria: string | null;
  required_format: string | null;
  instructions: string | null;
  restrictions: string | null;
  status: EssayStatus;
  position: number;
  content: EssayDoc;
  plain_text: string;
  word_count: number;
  revision: number;
  last_autosaved_at: string | null;
  prompt_analysis: PromptAnalysis | null;
  gap_questions: GapQuestion[];
  outline: Outline | null;
  outline_status: "none" | "draft" | "approved";
  outline_approved_at: string | null;
  blueprint: Blueprint | null;
  use_exemplars: boolean;
  exemplar_aspects: ExemplarAspect[];
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

export type VersionSource = "manual" | "ai_draft" | "ai_revision" | "restore" | "pre_restore" | "pre_ai" | "duplicate";

export interface EssayVersion {
  id: string;
  essay_id: string;
  version_number: number;
  title: string;
  content: EssayDoc;
  plain_text: string;
  word_count: number;
  source: VersionSource;
  change_summary: string | null;
  ai_job_id: string | null;
  evidence_refs: SourceRefs;
  review_status: "unreviewed" | "needs_improvement" | "strong";
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface EvidenceLink {
  id: string;
  essay_id: string;
  /** A library entry. Linking an "Ask first" entry to an essay is the user's approval to use it there. */
  entry_id: string | null;
  document_id: string | null;
  note: string | null;
  position: number;
}

/** The records that informed an AI output, stored with the job and on draft versions. */
export interface SourceRefs {
  entry_ids?: string[];
  document_ids?: string[];
  exemplar_ids?: string[];
  lesson_ids?: string[];
}

export type AiJobKind =
  | "prompt_analysis"
  | "gap_questions"
  | "evidence_recommendation"
  | "exemplar_analysis"
  | "exemplar_comparison"
  | "blueprint"
  | "outline"
  | "draft"
  | "rewrite"
  | "critique"
  | "readiness_review"
  | "section_questions";

export interface AiJob {
  id: string;
  kind: AiJobKind;
  action: string | null;
  essay_id: string | null;
  exemplar_id: string | null;
  application_id: string | null;
  idempotency_key: string;
  status: "pending" | "succeeded" | "failed" | "cancelled";
  model: string;
  prompt_version: string;
  source_refs: SourceRefs;
  output: unknown;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
}

export type FindingSeverity = "critical" | "optional";
export type FindingLabel = "strong" | "needs_improvement" | "missing_evidence";

export interface ReviewFinding {
  id: string;
  category: string;
  label: FindingLabel;
  severity: FindingSeverity;
  issue: string;
  why: string;
  excerpt?: string;
  requirement?: string;
  suggestion: string;
  /** Top-level block index in the reviewed draft, when the finding is tied to a paragraph. */
  blockIndex?: number;
  source: "checks" | "ai";
}

export interface EssayReview {
  id: string;
  essay_id: string;
  kind: "checks" | "ai";
  job_id: string | null;
  essay_revision: number;
  word_count: number;
  findings: ReviewFinding[];
  summary: Record<string, unknown>;
  dismissed_ids: string[];
  created_at: string;
}
