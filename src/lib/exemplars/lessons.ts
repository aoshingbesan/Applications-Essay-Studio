import type { ExemplarAspect } from "@/lib/domain/constants";
import type { ExemplarReport } from "@/lib/ai/schemas";

export interface SelectableLesson {
  key: string;
  aspect: ExemplarAspect | "lesson";
  title: string;
  content: string;
  basis?: "observed" | "interpreted" | "recommended";
}

const clip = (s: string, n = 900) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/**
 * The techniques a user can choose to apply from one analysis: one per aspect (structure, opening,
 * evidence, narrative, tone, conclusion) plus each transferable lesson. Content is the analyst's
 * description of a technique — never text from the exemplar itself.
 */
export function selectableLessons(report: ExemplarReport): SelectableLesson[] {
  const aspects: SelectableLesson[] = [
    {
      key: "aspect:structure",
      aspect: "structure",
      title: "Structural approach",
      content: clip(`Structure: ${report.structure.sections.map((s) => `${s.label} (${s.purpose})`).join(" → ")}. ${report.overview.structure_summary}`),
    },
    { key: "aspect:opening", aspect: "opening", title: "Opening technique", content: clip(`Opening (${report.opening.opening_type.replace(/_/g, " ")}): ${report.opening.how_it_begins}`) },
    { key: "aspect:evidence", aspect: "evidence", title: "Evidence strategy", content: clip(`Evidence: ${report.evidence.support_methods} ${report.evidence.contextualisation}`) },
    { key: "aspect:narrative", aspect: "narrative", title: "Narrative progression", content: clip(`Narrative progression: ${report.structure.progression} ${report.techniques.storytelling}`) },
    { key: "aspect:tone", aspect: "tone", title: "Tone and formality", content: clip(`Tone and voice: ${report.techniques.tone_voice}`) },
    { key: "aspect:conclusion", aspect: "conclusion", title: "Conclusion strategy", content: clip(`Conclusion: ${report.structure.conclusion_strategy}`) },
  ];
  const lessons: SelectableLesson[] = report.lessons.map((l, i) => ({
    key: `lesson:${i}`,
    aspect: "lesson",
    title: l.lesson,
    content: clip(l.lesson),
    basis: l.basis,
  }));
  return [...aspects, ...lessons];
}
