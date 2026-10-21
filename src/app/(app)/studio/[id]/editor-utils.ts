import { Extension, type Editor } from "@tiptap/react";
import { Plugin, PluginKey, TextSelection } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { paragraph, type DocNode, type EssayDoc } from "@/lib/essay/doc";

const highlightKey = new PluginKey<DecorationSet>("esHighlight");

/** Highlights the range an AI operation is working on; positions follow later edits. */
export const HighlightRange = Extension.create({
  name: "esHighlight",
  addProseMirrorPlugins() {
    return [
      new Plugin<DecorationSet>({
        key: highlightKey,
        state: {
          init: () => DecorationSet.empty,
          apply(tr, set) {
            const meta = tr.getMeta(highlightKey) as { from: number; to: number } | null | undefined;
            if (meta === null) return DecorationSet.empty;
            if (meta) return DecorationSet.create(tr.doc, [Decoration.inline(meta.from, meta.to, { class: "es-highlight" })]);
            return set.map(tr.mapping, tr.doc);
          },
        },
        props: {
          decorations(state) {
            return highlightKey.getState(state);
          },
        },
      }),
    ];
  },
});

export function setHighlight(editor: Editor, range: { from: number; to: number } | null) {
  editor.view.dispatch(editor.state.tr.setMeta(highlightKey, range));
}

export interface EditTarget {
  from: number;
  to: number;
  text: string;
  /** True when the range covers whole top-level blocks (replaced as paragraphs). */
  whole: boolean;
}

function blockBounds(editor: Editor, index: number) {
  const doc = editor.state.doc;
  let from = 0;
  for (let i = 0; i < index; i++) from += doc.child(i).nodeSize;
  return { from, to: from + doc.child(index).nodeSize };
}

function blockTarget(editor: Editor, index: number): EditTarget | null {
  const doc = editor.state.doc;
  if (index < 0 || index >= doc.childCount) return null;
  const { from, to } = blockBounds(editor, index);
  const text = doc.textBetween(from, to, "\n\n", "\n").trim();
  return text ? { from, to, text, whole: true } : null;
}

/** Non-empty text blocks (paragraphs and lists), by top-level index. */
function textBlockIndexes(editor: Editor): number[] {
  const out: number[] = [];
  editor.state.doc.forEach((node, _offset, index) => {
    if (node.type.name !== "heading" && node.textContent.trim()) out.push(index);
  });
  return out;
}

/**
 * What an editing action applies to: the selection if there is one; otherwise the opening or
 * closing paragraph for those actions, or the paragraph containing the cursor.
 */
export function resolveTarget(editor: Editor, action: string): EditTarget | null {
  const { from, to, empty } = editor.state.selection;
  if (!empty) {
    const text = editor.state.doc.textBetween(from, to, "\n\n", "\n").trim();
    if (text) return { from, to, text, whole: false };
  }
  const blocks = textBlockIndexes(editor);
  if (blocks.length === 0) return null;
  if (action === "opening") return blockTarget(editor, blocks[0]);
  if (action === "conclusion") return blockTarget(editor, blocks[blocks.length - 1]);
  return blockTarget(editor, editor.state.selection.$from.index(0));
}

const normalise = (s: string) => s.replace(/\s+/g, " ").trim();

/**
 * Replaces the target with revised text as one undoable step. Refuses (returns false) if the
 * text in that range changed after the revision was requested, so newer edits are never lost.
 */
export function applyReplacement(editor: Editor, target: EditTarget, revised: string): boolean {
  const size = editor.state.doc.content.size;
  if (target.to > size) return false;
  const current = editor.state.doc.textBetween(target.from, target.to, "\n\n", "\n");
  if (normalise(current) !== normalise(target.text)) return false;
  const paras = revised
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (paras.length === 0) return false;
  const content: DocNode[] | string = target.whole || paras.length > 1 ? paras.map(paragraph) : paras[0];
  return editor.chain().focus().insertContentAt({ from: target.from, to: target.to }, content).run();
}

/** Selects the first occurrence of a passage and scrolls to it. */
export function findAndSelect(editor: Editor, excerpt: string): boolean {
  const needle = excerpt.trim().slice(0, 60).toLowerCase();
  if (!needle) return false;
  let found: { from: number; to: number } | null = null;
  editor.state.doc.descendants((node, pos) => {
    if (found || !node.isText || !node.text) return !found;
    const at = node.text.toLowerCase().indexOf(needle);
    if (at >= 0) found = { from: pos + at, to: pos + at + needle.length };
    return false;
  });
  if (!found) return false;
  const { from, to } = found;
  editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, from, to)).scrollIntoView());
  editor.view.focus();
  return true;
}

/** Moves the cursor to a top-level block (section navigation, review findings). */
export function focusBlock(editor: Editor, index: number) {
  if (index < 0 || index >= editor.state.doc.childCount) return;
  const { from } = blockBounds(editor, index);
  editor.view.dispatch(editor.state.tr.setSelection(TextSelection.near(editor.state.doc.resolve(from + 1))).scrollIntoView());
  editor.view.focus();
}

/**
 * The document as it would be with the replacement applied, computed on a transaction that is
 * never dispatched — used to save an AI edit as a separate version without changing the draft.
 */
export function docWithReplacement(editor: Editor, target: EditTarget, revised: string): EssayDoc | null {
  const current = editor.state.doc.textBetween(target.from, Math.min(target.to, editor.state.doc.content.size), "\n\n", "\n");
  if (normalise(current) !== normalise(target.text)) return null;
  const paras = revised
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (!paras.length) return null;
  const tr = editor.state.tr;
  if (target.whole || paras.length > 1) {
    const nodes = paras.map((p) => editor.schema.nodeFromJSON(paragraph(p)));
    tr.replaceWith(target.from, target.to, nodes);
  } else {
    tr.insertText(paras[0], target.from, target.to);
  }
  return tr.doc.toJSON() as EssayDoc;
}
