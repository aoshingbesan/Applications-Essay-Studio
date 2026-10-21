export type WordLimitState = "empty" | "under" | "near" | "within" | "over";

export interface WordLimitStatus {
  state: WordLimitState;
  /** Progress towards the maximum (or minimum when no maximum), 0–100+. */
  percent: number | null;
  message: string;
}

/**
 * Word-limit status. "near" means within 5% of the maximum; "under" means below the minimum,
 * or below 70% of the maximum when no minimum is set (an advisory, not a rule).
 */
export function wordLimitStatus(words: number, min: number | null, max: number | null): WordLimitStatus {
  if (words === 0) return { state: "empty", percent: max ? 0 : null, message: "No text yet" };
  if (max !== null && words > max) {
    return { state: "over", percent: Math.round((words / max) * 100), message: `${words - max} words over the ${max}-word limit` };
  }
  if (min !== null && words < min) {
    return { state: "under", percent: max ? Math.round((words / max) * 100) : Math.round((words / min) * 100), message: `${min - words} words below the ${min}-word minimum` };
  }
  if (max !== null) {
    const percent = Math.round((words / max) * 100);
    if (words >= max * 0.95) return { state: "near", percent, message: `${max - words} words left` };
    if (min === null && words < max * 0.7) return { state: "under", percent, message: `${max - words} words available — the essay may be underdeveloped` };
    return { state: "within", percent, message: `${max - words} words left` };
  }
  return { state: "within", percent: null, message: min !== null ? `Above the ${min}-word minimum` : "No word limit set" };
}

export function withinLimits(words: number, min: number | null, max: number | null): boolean {
  return (max === null || words <= max) && (min === null || words >= min);
}
