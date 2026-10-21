import {
  CLASSIFICATION_LABELS,
  ESSAY_STATUS_LABELS,
  EXTRACTION_LABELS,
  PROVENANCE_LABELS,
  type EssayStatus,
  type EvidenceClassification,
  type ExemplarProvenance,
  type ExtractionStatus,
} from "@/lib/domain/constants";
import { PRIVACY_DESCRIPTIONS, PRIVACY_LABELS, type Privacy } from "@/lib/library/sections";
import type { FindingLabel } from "@/lib/domain/types";
import type { AnalysisDisplay } from "@/lib/exemplars/status";
import { cn } from "@/lib/utils";

const neutral = "bg-muted text-muted-foreground ring-border";
const info = "bg-sky-50 text-sky-800 ring-sky-200 dark:bg-sky-950 dark:text-sky-200 dark:ring-sky-900";
const warn = "bg-amber-50 text-amber-900 ring-amber-200 dark:bg-amber-950 dark:text-amber-200 dark:ring-amber-900";
const good = "bg-emerald-50 text-emerald-800 ring-emerald-200 dark:bg-emerald-950 dark:text-emerald-200 dark:ring-emerald-900";
const bad = "bg-red-50 text-red-800 ring-red-200 dark:bg-red-950 dark:text-red-200 dark:ring-red-900";
const violet = "bg-violet-50 text-violet-800 ring-violet-200 dark:bg-violet-950 dark:text-violet-200 dark:ring-violet-900";

export function Pill({ tone = neutral, className, children }: { tone?: string; className?: string; children: React.ReactNode }) {
  return <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset", tone, className)}>{children}</span>;
}

const STATUS_TONE: Record<EssayStatus, string> = {
  not_started: neutral,
  in_progress: info,
  needs_review: warn,
  ready_to_submit: good,
  submitted: "bg-foreground text-background ring-foreground",
};

export function StatusBadge({ status, className }: { status: EssayStatus; className?: string }) {
  return (
    <Pill tone={STATUS_TONE[status]} className={className}>
      {ESSAY_STATUS_LABELS[status]}
    </Pill>
  );
}

const CLASSIFICATION_TONE: Record<EvidenceClassification, string> = {
  verified_fact: good,
  quantified_achievement: info,
  personal_reflection: violet,
  goal_aspiration: neutral,
  unverified: warn,
};

export function ClassificationBadge({ value }: { value: EvidenceClassification }) {
  return <Pill tone={CLASSIFICATION_TONE[value]}>{CLASSIFICATION_LABELS[value]}</Pill>;
}

const PRIVACY_TONE: Record<Privacy, string> = { private: bad, ask: warn, available: good };

export function PrivacyBadge({ value }: { value: Privacy }) {
  return (
    <span title={PRIVACY_DESCRIPTIONS[value]}>
      <Pill tone={PRIVACY_TONE[value]}>{PRIVACY_LABELS[value]}</Pill>
    </span>
  );
}

const PROVENANCE_TONE: Record<ExemplarProvenance, string> = { official_sample: good, independently_verified: good, uploader_reported: info, unknown: neutral };

export function ProvenanceBadge({ value }: { value: ExemplarProvenance }) {
  return <Pill tone={PROVENANCE_TONE[value]}>{PROVENANCE_LABELS[value]}</Pill>;
}

const EXTRACTION_TONE: Record<ExtractionStatus, string> = { pending: neutral, extracted: good, needs_ocr: warn, unsupported: warn, failed: bad };

export function ExtractionBadge({ value }: { value: ExtractionStatus }) {
  return <Pill tone={EXTRACTION_TONE[value]}>{EXTRACTION_LABELS[value]}</Pill>;
}

export type { AnalysisDisplay };
const ANALYSIS_LABELS: Record<AnalysisDisplay, string> = {
  not_started: "Not analysed",
  queued: "Queued",
  running: "Analysing…",
  complete: "Analysed",
  failed: "Analysis failed",
  stale: "Out of date",
};
const ANALYSIS_TONE: Record<AnalysisDisplay, string> = { not_started: neutral, queued: info, running: info, complete: good, failed: bad, stale: warn };

export function AnalysisBadge({ value }: { value: AnalysisDisplay }) {
  return <Pill tone={ANALYSIS_TONE[value]}>{ANALYSIS_LABELS[value]}</Pill>;
}

const FINDING_TONE: Record<FindingLabel, string> = { strong: good, needs_improvement: warn, missing_evidence: bad };
const FINDING_LABELS: Record<FindingLabel, string> = { strong: "Strong", needs_improvement: "Needs Improvement", missing_evidence: "Missing Evidence" };

export function FindingBadge({ value }: { value: FindingLabel }) {
  return <Pill tone={FINDING_TONE[value]}>{FINDING_LABELS[value]}</Pill>;
}
