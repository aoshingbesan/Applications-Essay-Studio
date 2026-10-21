// DOCX, PDF and plain-text export of saved essays. Output contains only the essay text (and an
// optional cover page): no AI commentary, review notes or internal metadata.

import { AlignmentType, Document, Footer, HeadingLevel, Packer, PageBreak, PageNumber, Paragraph, TextRun } from "docx";
import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";
import { docToPlainText, type EssayDoc, type DocNode } from "./doc";

export interface ExportPiece {
  title: string;
  doc: EssayDoc;
}

export interface ExportOptions {
  /** Document metadata title, also used for the file name. */
  documentTitle: string;
  font: "serif" | "sans" | "mono";
  fontSize: number;
  margins: "narrow" | "normal" | "wide";
  lineSpacing: number;
  pageNumbers: boolean;
  /** Print each essay's title above it. */
  includeTitles: boolean;
  /** Optional cover page; disabled unless explicitly requested. */
  cover: { title: string; subtitle?: string; author?: string } | null;
}

export const DEFAULT_EXPORT_OPTIONS: Omit<ExportOptions, "documentTitle"> = {
  font: "serif",
  fontSize: 12,
  margins: "normal",
  lineSpacing: 1.5,
  pageNumbers: true,
  includeTitles: false,
  cover: null,
};

const MARGIN_POINTS = { narrow: 36, normal: 72, wide: 108 } as const;
const DOCX_FONTS = { serif: "Times New Roman", sans: "Arial", mono: "Courier New" } as const;

interface Run {
  text: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  break?: boolean;
}

interface Block {
  kind: "paragraph" | "heading" | "bullet" | "ordered" | "title" | "pageBreak";
  level?: number;
  index?: number;
  align?: "left" | "center" | "right" | "justify";
  runs: Run[];
}

function runsOf(node: DocNode): Run[] {
  const runs: Run[] = [];
  const walk = (n: DocNode) => {
    if (n.type === "text") {
      const marks = new Set((n.marks ?? []).map((m) => m.type));
      runs.push({ text: n.text ?? "", bold: marks.has("bold"), italic: marks.has("italic"), underline: marks.has("underline") });
    } else if (n.type === "hardBreak") {
      runs.push({ text: "", bold: false, italic: false, underline: false, break: true });
    } else {
      n.content?.forEach(walk);
    }
  };
  walk(node);
  return runs;
}

const plain = (text: string): Run[] => [{ text, bold: false, italic: false, underline: false }];

/** Flattens the documents into simple blocks that both exporters can render. */
export function toBlocks(pieces: ExportPiece[], options: Pick<ExportOptions, "includeTitles">): Block[] {
  const blocks: Block[] = [];
  pieces.forEach((piece, i) => {
    if (i > 0) blocks.push({ kind: "pageBreak", runs: [] });
    if (options.includeTitles) blocks.push({ kind: "title", runs: plain(piece.title) });
    for (const node of piece.doc.content) {
      const align = (node.attrs?.textAlign as Block["align"]) ?? "left";
      if (node.type === "heading") {
        blocks.push({ kind: "heading", level: Number(node.attrs?.level ?? 2), align, runs: runsOf(node) });
      } else if (node.type === "bulletList" || node.type === "orderedList") {
        node.content?.forEach((item, j) => {
          blocks.push({ kind: node.type === "bulletList" ? "bullet" : "ordered", index: j + 1, align, runs: runsOf(item) });
        });
      } else if (node.type !== "horizontalRule") {
        blocks.push({ kind: "paragraph", align, runs: runsOf(node) });
      }
    }
  });
  return blocks;
}

// ---------------------------------------------------------------------------
// Plain text
// ---------------------------------------------------------------------------

export function exportText(pieces: ExportPiece[], options: Pick<ExportOptions, "includeTitles" | "cover">): string {
  const parts: string[] = [];
  if (options.cover) {
    parts.push([options.cover.title, options.cover.subtitle, options.cover.author].filter(Boolean).join("\n"));
  }
  for (const p of pieces) {
    const body = docToPlainText(p.doc);
    parts.push(options.includeTitles ? `${p.title}\n\n${body}` : body);
  }
  return parts.join("\n\n\n") + "\n";
}

// ---------------------------------------------------------------------------
// DOCX
// ---------------------------------------------------------------------------

const DOCX_ALIGN = { left: AlignmentType.LEFT, center: AlignmentType.CENTER, right: AlignmentType.RIGHT, justify: AlignmentType.JUSTIFIED } as const;

export async function exportDocx(pieces: ExportPiece[], options: ExportOptions): Promise<Buffer> {
  const size = Math.round(options.fontSize * 2); // half-points
  const line = Math.round(240 * options.lineSpacing);
  const twips = MARGIN_POINTS[options.margins] * 20;

  const children: Paragraph[] = [];
  if (options.cover) {
    children.push(
      new Paragraph({ spacing: { before: 3600 }, alignment: AlignmentType.CENTER, children: [new TextRun({ text: options.cover.title, bold: true, size: size + 16 })] }),
      ...[options.cover.subtitle, options.cover.author]
        .filter((v): v is string => Boolean(v))
        .map((t) => new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 240 }, children: [new TextRun({ text: t, size: size + 2 })] })),
      new Paragraph({ children: [new PageBreak()] }),
    );
  }

  for (const b of toBlocks(pieces, options)) {
    if (b.kind === "pageBreak") {
      children.push(new Paragraph({ children: [new PageBreak()] }));
      continue;
    }
    const runs = b.runs.map((r) =>
      r.break
        ? new TextRun({ text: "", break: 1 })
        : new TextRun({ text: r.text, bold: r.bold || undefined, italics: r.italic || undefined, underline: r.underline ? {} : undefined }),
    );
    if (b.kind === "title") {
      children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { after: 240 }, children: b.runs.map((r) => new TextRun({ text: r.text, bold: true, size: size + 6 })) }));
    } else if (b.kind === "heading") {
      children.push(
        new Paragraph({
          heading: b.level === 3 ? HeadingLevel.HEADING_3 : HeadingLevel.HEADING_2,
          alignment: DOCX_ALIGN[b.align ?? "left"],
          spacing: { before: 240, after: 120 },
          children: b.runs.map((r) => new TextRun({ text: r.text, bold: true, size: size + (b.level === 3 ? 0 : 2) })),
        }),
      );
    } else if (b.kind === "bullet" || b.kind === "ordered") {
      const prefix = b.kind === "bullet" ? "•\t" : `${b.index}.\t`;
      children.push(new Paragraph({ indent: { left: 720, hanging: 360 }, spacing: { after: 120, line }, children: [new TextRun(prefix), ...runs] }));
    } else {
      children.push(new Paragraph({ alignment: DOCX_ALIGN[b.align ?? "left"], spacing: { after: 200, line }, children: runs }));
    }
  }

  const document = new Document({
    creator: "Essay Studio",
    title: options.documentTitle,
    styles: { default: { document: { run: { font: DOCX_FONTS[options.font], size } } } },
    sections: [
      {
        properties: { page: { margin: { top: twips, right: twips, bottom: twips, left: twips } } },
        footers: options.pageNumbers
          ? {
              default: new Footer({
                children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ children: [PageNumber.CURRENT], size: Math.max(16, size - 4), color: "666666" })] })],
              }),
            }
          : undefined,
        children,
      },
    ],
  });
  return Packer.toBuffer(document);
}

// ---------------------------------------------------------------------------
// PDF
// ---------------------------------------------------------------------------

const PAGE = { width: 595.28, height: 841.89 };
type FontSet = Record<"regular" | "bold" | "italic" | "boldItalic", PDFFont>;

const PDF_FONTS = {
  serif: [StandardFonts.TimesRoman, StandardFonts.TimesRomanBold, StandardFonts.TimesRomanItalic, StandardFonts.TimesRomanBoldItalic],
  sans: [StandardFonts.Helvetica, StandardFonts.HelveticaBold, StandardFonts.HelveticaOblique, StandardFonts.HelveticaBoldOblique],
  mono: [StandardFonts.Courier, StandardFonts.CourierBold, StandardFonts.CourierOblique, StandardFonts.CourierBoldOblique],
} as const;

function pickFont(fonts: FontSet, r: Pick<Run, "bold" | "italic">): PDFFont {
  if (r.bold && r.italic) return fonts.boldItalic;
  if (r.bold) return fonts.bold;
  if (r.italic) return fonts.italic;
  return fonts.regular;
}

/** Replaces characters the standard PDF fonts cannot encode. */
export function toWinAnsi(text: string, font: PDFFont): string {
  let out = "";
  for (const ch of text) {
    try {
      font.encodeText(ch);
      out += ch;
    } catch {
      const stripped = ch.normalize("NFKD").replace(/[̀-ͯ]/g, "");
      try {
        font.encodeText(stripped);
        out += stripped;
      } catch {
        out += "?";
      }
    }
  }
  return out;
}

interface Word {
  text: string;
  font: PDFFont;
  underline: boolean;
  width: number;
  space: number;
  hardBreak?: boolean;
}

export async function exportPdf(pieces: ExportPiece[], options: ExportOptions): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(options.documentTitle);
  pdf.setCreator("Essay Studio");

  const [r, b, i, bi] = PDF_FONTS[options.font];
  const fonts: FontSet = {
    regular: await pdf.embedFont(r),
    bold: await pdf.embedFont(b),
    italic: await pdf.embedFont(i),
    boldItalic: await pdf.embedFont(bi),
  };
  const margin = MARGIN_POINTS[options.margins];
  const baseSize = options.fontSize;
  const contentWidth = PAGE.width - margin * 2;
  const paragraphGap = baseSize * 0.7;

  let page = pdf.addPage([PAGE.width, PAGE.height]);
  let y = PAGE.height - margin;
  const newPage = () => {
    page = pdf.addPage([PAGE.width, PAGE.height]);
    y = PAGE.height - margin;
  };

  if (options.cover) {
    const lines = [
      { text: options.cover.title, font: fonts.bold, size: baseSize + 8 },
      ...[options.cover.subtitle, options.cover.author].filter((v): v is string => Boolean(v)).map((t) => ({ text: t, font: fonts.regular, size: baseSize + 1 })),
    ];
    let cy = PAGE.height * 0.62;
    for (const l of lines) {
      const t = toWinAnsi(l.text, l.font);
      const w = l.font.widthOfTextAtSize(t, l.size);
      page.drawText(t, { x: Math.max(margin, (PAGE.width - w) / 2), y: cy, size: l.size, font: l.font, color: rgb(0.08, 0.08, 0.08) });
      cy -= l.size * 2;
    }
    newPage();
  }

  for (const block of toBlocks(pieces, options)) {
    if (block.kind === "pageBreak") {
      newPage();
      continue;
    }
    const isHeading = block.kind === "heading" || block.kind === "title";
    const size = block.kind === "title" ? baseSize + 4 : block.kind === "heading" ? baseSize + (block.level === 3 ? 0.5 : 2) : baseSize;
    const indent = block.kind === "bullet" || block.kind === "ordered" ? 18 : 0;
    const width = contentWidth - indent;

    const words: Word[] = [];
    for (const run of block.runs) {
      if (run.break) {
        words.push({ text: "", font: fonts.regular, underline: false, width: 0, space: 0, hardBreak: true });
        continue;
      }
      const font = pickFont(fonts, { bold: run.bold || isHeading, italic: run.italic });
      const safe = toWinAnsi(run.text, font);
      for (const part of safe.split(/(\s+)/)) {
        if (!part) continue;
        if (/^\s+$/.test(part)) {
          if (words.length) words[words.length - 1].space += font.widthOfTextAtSize(" ", size);
          continue;
        }
        words.push({ text: part, font, underline: run.underline, width: font.widthOfTextAtSize(part, size), space: 0 });
      }
    }

    const lines: Word[][] = [[]];
    let lineWidth = 0;
    for (const w of words) {
      if (w.hardBreak) {
        lines.push([]);
        lineWidth = 0;
        continue;
      }
      const current = lines[lines.length - 1];
      const prevSpace = current.length ? current[current.length - 1].space : 0;
      if (current.length && lineWidth + prevSpace + w.width > width) {
        lines.push([w]);
        lineWidth = w.width;
      } else {
        lineWidth += prevSpace + w.width;
        current.push(w);
      }
    }

    const lineHeight = size * (isHeading ? 1.3 : 1.2 * options.lineSpacing);
    if (isHeading) {
      y -= paragraphGap * 0.6;
      // Keep headings with the first lines of the following paragraph.
      if (y - lineHeight * 3 < margin) newPage();
    }

    lines.forEach((line, li) => {
      if (y - lineHeight < margin) newPage();
      y -= lineHeight;
      let x = margin + indent;
      if (li === 0 && indent) {
        const marker = block.kind === "bullet" ? "•" : `${block.index}.`;
        page.drawText(marker, { x: margin + 4, y, size, font: fonts.regular });
      }
      const lineW = line.reduce((acc, w, k) => acc + w.width + (k < line.length - 1 ? w.space : 0), 0);
      if (block.align === "center") x += (width - lineW) / 2;
      if (block.align === "right") x += width - lineW;
      for (const w of line) {
        page.drawText(w.text, { x, y, size, font: w.font, color: rgb(0.08, 0.08, 0.08) });
        if (w.underline) page.drawLine({ start: { x, y: y - 1.5 }, end: { x: x + w.width, y: y - 1.5 }, thickness: 0.5 });
        x += w.width + w.space;
      }
    });
    y -= paragraphGap;
  }

  if (options.pageNumbers) {
    const small = fonts.regular;
    const pages = pdf.getPages();
    const first = options.cover ? 1 : 0;
    pages.slice(first).forEach((p, idx) => {
      const label = String(idx + 1);
      const lw = small.widthOfTextAtSize(label, 9);
      p.drawText(label, { x: (PAGE.width - lw) / 2, y: Math.min(36, margin / 2), size: 9, font: small, color: rgb(0.4, 0.4, 0.4) });
    });
  }

  return pdf.save();
}

export function safeFileName(title: string): string {
  return (title.normalize("NFKD").replace(/[^\w\s.-]+/g, "").trim().replace(/\s+/g, "-").slice(0, 80) || "essay").toLowerCase();
}
