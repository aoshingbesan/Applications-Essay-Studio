import type { AnalysisStatus, Exemplar, ExemplarAnalysis } from "@/lib/domain/types";

export type AnalysisDisplay = AnalysisStatus | "not_started" | "stale";

/**
 * What to show for an exemplar's analysis. A completed analysis whose text hash or specification
 * no longer matches is "stale": it is never presented as describing the current text.
 */
export function analysisDisplay(
  exemplar: Pick<Exemplar, "source_hash">,
  latest: Pick<ExemplarAnalysis, "status" | "source_hash" | "spec_version"> | null | undefined,
  specVersion: string,
): AnalysisDisplay {
  if (!latest) return "not_started";
  if (latest.status !== "complete") return latest.status;
  if (latest.source_hash !== exemplar.source_hash || latest.spec_version !== specVersion) return "stale";
  return "complete";
}
