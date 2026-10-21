// Utilities for the essay document, stored as TipTap/ProseMirror JSON.
// These are pure functions shared by the editor, the API routes, exports and tests.

export interface DocMark {
  type: string;
  attrs?: Record<string, unknown>;
}

export interface DocNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: DocNode[];
  text?: string;
  marks?: DocMark[];
}

export interface EssayDoc {
  type: "doc";
  content: DocNode[];
}

export const EMPTY_DOC: EssayDoc = { type: "doc", content: [] };

export function isEssayDoc(value: unknown): value is EssayDoc {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { type?: unknown }).type === "doc" &&
    Array.isArray((value as { content?: unknown }).content)
  );
}

/**
 * Editor JSON as a document. ProseMirror omits `content` for an empty document, so a missing
 * array means "no blocks" rather than invalid input.
 */
export function asDoc(value: unknown): EssayDoc {
  if (typeof value === "object" && value !== null && (value as { type?: unknown }).type === "doc") {
    const content = (value as { content?: unknown }).content;
    return { type: "doc", content: Array.isArray(content) ? (content as DocNode[]) : [] };
  }
  return { type: "doc", content: [] };
}

/** Text of a single node, with hard breaks rendered as newlines. */
export function nodeText(node: DocNode): string {
  if (node.type === "text") return node.text ?? "";
  if (node.type === "hardBreak") return "\n";
  if (!node.content) return "";
  const sep = node.type === "bulletList" || node.type === "orderedList" ? "\n" : "";
  return node.content.map(nodeText).join(sep);
}

/** Top-level blocks of the document as plain text. */
export function blockTexts(doc: EssayDoc): string[] {
  return (doc.content ?? []).map(nodeText);
}

export function docToPlainText(doc: EssayDoc): string {
  return blockTexts(doc).join("\n\n").replace(/\n{3,}/g, "\n\n").trim();
}

export function countWords(text: string): number {
  const matches = text.trim().match(/[\p{L}\p{N}][\p{L}\p{N}'’.-]*/gu);
  return matches ? matches.length : 0;
}

/** Builds a paragraph node, turning single newlines into hard breaks. */
export function paragraph(text: string): DocNode {
  const lines = text.split("\n");
  const content: DocNode[] = [];
  lines.forEach((line, i) => {
    if (i > 0) content.push({ type: "hardBreak" });
    if (line.length > 0) content.push({ type: "text", text: line });
  });
  return content.length > 0 ? { type: "paragraph", content } : { type: "paragraph" };
}

export function docFromParagraphs(paragraphs: string[]): EssayDoc {
  return { type: "doc", content: paragraphs.map(paragraph) };
}

export class BlockConflictError extends Error {
  constructor(message = "The paragraph has changed since the rewrite was requested.") {
    super(message);
    this.name = "BlockConflictError";
  }
}

const normalise = (s: string) => s.replace(/\s+/g, " ").trim();

/**
 * Replaces exactly one top-level block with new paragraph text, leaving every other block
 * (and its formatting) untouched. Throws BlockConflictError if the block's current text no
 * longer matches what was sent for rewriting, so newer edits are never silently overwritten.
 */
export function replaceBlock(doc: EssayDoc, index: number, expectedText: string, replacement: string): EssayDoc {
  if (index < 0 || index >= doc.content.length) throw new BlockConflictError("That paragraph no longer exists.");
  const current = doc.content[index];
  if (normalise(nodeText(current)) !== normalise(expectedText)) throw new BlockConflictError();
  const replacementNodes = replacement
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map(paragraph);
  if (replacementNodes.length === 0) throw new Error("Replacement text is empty.");
  return {
    ...doc,
    content: [...doc.content.slice(0, index), ...replacementNodes, ...doc.content.slice(index + 1)],
  };
}

const PLACEHOLDER_RE = /\[(?:[A-Z][^\]\n]{1,80})\]|\{\{[^}\n]{1,80}\}\}|\bTODO\b|\bTBC\b|\bXX+\b|\bINSERT\b/g;

/** Unresolved placeholders such as [Programme name], {{name}}, TODO or XX. */
export function findPlaceholders(text: string): string[] {
  return Array.from(new Set(text.match(PLACEHOLDER_RE) ?? []));
}

const ALLOWED_NODES = new Set([
  "doc",
  "paragraph",
  "heading",
  "text",
  "hardBreak",
  "bulletList",
  "orderedList",
  "listItem",
  "blockquote",
  "horizontalRule",
]);
const ALLOWED_MARKS = new Set(["bold", "italic", "underline", "strike"]);
const MAX_DEPTH = 8;

function sanitizeNode(node: unknown, depth: number): DocNode | null {
  if (depth > MAX_DEPTH || typeof node !== "object" || node === null) return null;
  const n = node as Record<string, unknown>;
  if (typeof n.type !== "string" || !ALLOWED_NODES.has(n.type)) return null;
  const out: DocNode = { type: n.type };
  if (n.type === "text") {
    if (typeof n.text !== "string" || n.text.length === 0) return null;
    out.text = n.text.slice(0, 20000);
    if (Array.isArray(n.marks)) {
      const marks = n.marks
        .filter((m): m is { type: string } => typeof m === "object" && m !== null && typeof (m as { type?: unknown }).type === "string")
        .filter((m) => ALLOWED_MARKS.has(m.type))
        .map((m) => ({ type: m.type }));
      if (marks.length) out.marks = marks;
    }
    return out;
  }
  const attrs = (typeof n.attrs === "object" && n.attrs !== null ? n.attrs : {}) as Record<string, unknown>;
  const safeAttrs: Record<string, unknown> = {};
  if (n.type === "heading") safeAttrs.level = [1, 2, 3].includes(Number(attrs.level)) ? Number(attrs.level) : 2;
  if (typeof attrs.textAlign === "string" && ["left", "center", "right", "justify"].includes(attrs.textAlign)) {
    safeAttrs.textAlign = attrs.textAlign;
  }
  if (Object.keys(safeAttrs).length) out.attrs = safeAttrs;
  if (Array.isArray(n.content)) {
    const children = n.content.map((c) => sanitizeNode(c, depth + 1)).filter((c): c is DocNode => c !== null);
    if (children.length) out.content = children;
  }
  return out;
}

/** Keeps only known node types, marks and attributes. Returns null for anything that is not a document. */
export function sanitizeDoc(value: unknown): EssayDoc | null {
  if (typeof value !== "object" || value === null || (value as { type?: unknown }).type !== "doc") return null;
  const raw = (value as { content?: unknown }).content;
  if (raw !== undefined && !Array.isArray(raw)) return null;
  const content = ((raw ?? []) as unknown[]).map((c) => sanitizeNode(c, 1)).filter((c): c is DocNode => c !== null);
  return { type: "doc", content };
}

export function heading(text: string, level: 2 | 3 = 2): DocNode {
  return { type: "heading", attrs: { level }, content: text ? [{ type: "text", text }] : undefined };
}

/** Builds a document from sections; headings are included only when requested. */
export function docFromSections(sections: { heading?: string; paragraphs: string[] }[], includeHeadings: boolean): EssayDoc {
  const content: DocNode[] = [];
  for (const s of sections) {
    if (includeHeadings && s.heading?.trim()) content.push(heading(s.heading.trim()));
    for (const p of s.paragraphs) if (p.trim()) content.push(paragraph(p.trim()));
  }
  return { type: "doc", content };
}

/** Plain text (paragraphs separated by blank lines) to a document. */
export function docFromText(text: string): EssayDoc {
  return docFromParagraphs(
    text
      .split(/\n{2,}/)
      .map((p) => p.trim())
      .filter(Boolean),
  );
}

/** Top-level headings with their block index, for section navigation. */
export function docHeadings(doc: EssayDoc): { index: number; level: number; text: string }[] {
  return (doc.content ?? [])
    .map((node, index) => ({ node, index }))
    .filter(({ node }) => node.type === "heading")
    .map(({ node, index }) => ({ index, level: Number(node.attrs?.level ?? 2), text: nodeText(node) }));
}

/** Paragraph-level blocks with their index, used to anchor review findings. */
export function docParagraphs(doc: EssayDoc): { index: number; text: string }[] {
  return (doc.content ?? [])
    .map((node, index) => ({ index, text: nodeText(node), type: node.type }))
    .filter((b) => b.type !== "heading" && b.text.trim().length > 0)
    .map(({ index, text }) => ({ index, text }));
}
