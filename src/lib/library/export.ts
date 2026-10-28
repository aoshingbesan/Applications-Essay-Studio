// Story Bank export: the user's own entries, grouped by section, as pieces for the essay exporters.
// Each entry is printed once, under its main section; privacy filtering happens here, not in the UI.

import { CLASSIFICATION_LABELS } from "@/lib/domain/constants";
import type { LibraryEntry } from "@/lib/domain/types";
import { paragraph, type DocNode } from "@/lib/essay/doc";
import type { ExportPiece } from "@/lib/essay/export";
import { ENTRY_SECTIONS, PRIVACY_LABELS, SECTION_BY_KEY, sectionTitle, type Privacy } from "./sections";

/** Which privacy levels a download includes. */
export const EXPORT_SCOPES = {
  all: ["available", "ask", "private"],
  shareable: ["available", "ask"],
  available: ["available"],
} as const satisfies Record<string, readonly Privacy[]>;
export type ExportScope = keyof typeof EXPORT_SCOPES;

const heading = (text: string, level = 2): DocNode => ({ type: "heading", attrs: { level }, content: [{ type: "text", text }] });

/** "Label: value" with a bold label; newlines in the value become line breaks. */
function labelled(label: string, value: string): DocNode {
  const body = paragraph(value);
  return { type: "paragraph", content: [{ type: "text", text: `${label}: `, marks: [{ type: "bold" }] }, ...(body.content ?? [])] };
}

const italic = (text: string): DocNode => ({ type: "paragraph", content: [{ type: "text", text, marks: [{ type: "italic" }] }] });

function entryNodes(e: LibraryEntry): DocNode[] {
  const meta = [e.organisation, e.role, e.period, e.location].filter(Boolean).join(" · ");
  const status = [CLASSIFICATION_LABELS[e.classification], PRIVACY_LABELS[e.privacy]];
  if (e.also_in.length > 0) status.push(`also in ${e.also_in.map(sectionTitle).join(", ")}`);

  const nodes: DocNode[] = [heading(e.title), italic(status.join(" · "))];
  if (meta) nodes.push(paragraph(meta));
  const fields: [string, string | null][] = [
    ["Summary", e.summary],
    ["Figures and results", e.figures],
    ["Context", e.context],
    ["Challenge", e.challenge],
    ["What I did", e.actions],
    ["Outcome", e.outcome],
    ["Measurable impact", e.measurable_impact],
    ["What I learned", e.lessons],
    ["Why it mattered", e.motivation],
  ];
  for (const [label, value] of fields) if (value?.trim()) nodes.push(labelled(label, value.trim()));
  if (e.narrative?.trim()) {
    nodes.push(heading("In my own words", 3));
    for (const para of e.narrative.trim().split(/\n{2,}/)) nodes.push(paragraph(para.trim()));
  }
  const lists: [string, string[]][] = [
    ["Skills", e.skills],
    ["Selection criteria", e.related_criteria],
    ["Tags", e.tags],
  ];
  for (const [label, items] of lists) if (items.length > 0) nodes.push(labelled(label, items.join(", ")));
  if (e.links?.trim()) nodes.push(labelled("Links", e.links.trim()));
  if (e.source?.trim()) nodes.push(labelled("Can be verified by", e.source.trim()));
  return nodes;
}

/** One piece (page-separated, titled) per section that has entries in scope. Archived entries are left out. */
export function storyBankPieces(entries: LibraryEntry[], scope: ExportScope): ExportPiece[] {
  const allowed: readonly Privacy[] = EXPORT_SCOPES[scope];
  const kept = entries
    .filter((e) => !e.archived_at && allowed.includes(e.privacy))
    .sort((a, b) => a.position - b.position || a.created_at.localeCompare(b.created_at));
  return ENTRY_SECTIONS.flatMap((section) => {
    const inSection = kept.filter((e) => e.section === section);
    if (inSection.length === 0) return [];
    const def = SECTION_BY_KEY[section];
    return [{ title: `${def.number} · ${def.title}`, doc: { type: "doc" as const, content: inSection.flatMap(entryNodes) } }];
  });
}
