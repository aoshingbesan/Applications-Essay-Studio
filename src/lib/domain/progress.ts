// Progress and status are always derived from stored application and essay data.

import type { EssayStatus } from "./constants";

export interface EssayProgressInput {
  status: EssayStatus;
  word_count: number;
  max_words: number | null;
  outline_status?: "none" | "draft" | "approved";
  archived_at?: string | null;
}

const STATUS_WEIGHT: Record<EssayStatus, number> = {
  not_started: 0,
  in_progress: 0.35,
  needs_review: 0.7,
  ready_to_submit: 0.95,
  submitted: 1,
};

/** 0–100 for one essay: workflow status, refined by draft length while it is in progress. */
export function essayProgress(e: EssayProgressInput): number {
  if (e.status === "not_started") {
    if (e.word_count > 0) return 10;
    return e.outline_status === "approved" ? 10 : e.outline_status === "draft" ? 5 : 0;
  }
  if (e.status === "in_progress") {
    const base = e.outline_status === "approved" ? 0.2 : 0.1;
    const lengthShare = e.max_words ? Math.min(1, e.word_count / e.max_words) : e.word_count > 0 ? 0.5 : 0;
    return Math.round((base + lengthShare * (0.6 - base)) * 100);
  }
  return Math.round(STATUS_WEIGHT[e.status] * 100);
}

export interface ApplicationProgress {
  status: EssayStatus;
  percent: number;
  essaysTotal: number;
  essaysReady: number;
}

/** Application status from its essays, unless the application itself was marked submitted. */
export function applicationProgress(essays: EssayProgressInput[], submittedAt: string | null): ApplicationProgress {
  const active = essays.filter((e) => !e.archived_at);
  const essaysReady = active.filter((e) => e.status === "ready_to_submit" || e.status === "submitted").length;
  if (submittedAt) return { status: "submitted", percent: 100, essaysTotal: active.length, essaysReady };
  if (active.length === 0) return { status: "not_started", percent: 0, essaysTotal: 0, essaysReady: 0 };
  const percent = Math.round(active.reduce((acc, e) => acc + essayProgress(e), 0) / active.length);
  let status: EssayStatus;
  if (active.every((e) => e.status === "submitted")) status = "submitted";
  else if (active.every((e) => e.status === "ready_to_submit" || e.status === "submitted")) status = "ready_to_submit";
  else if (active.some((e) => e.status === "needs_review")) status = "needs_review";
  else if (active.every((e) => e.status === "not_started" && e.word_count === 0)) status = "not_started";
  else status = "in_progress";
  return { status, percent, essaysTotal: active.length, essaysReady };
}
