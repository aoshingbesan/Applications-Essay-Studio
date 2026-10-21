import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { Document, Packer, Paragraph, TextRun } from "docx";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { detectKind, extractText } from "@/lib/documents/extract";
import { exportDocx, exportPdf, exportText, DEFAULT_EXPORT_OPTIONS, safeFileName } from "@/lib/essay/export";
import { docFromSections } from "@/lib/essay/doc";

async function makePdf(text: string | null): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage();
  if (text) page.drawText(text, { x: 50, y: 700, size: 12, font: await pdf.embedFont(StandardFonts.Helvetica) });
  return pdf.save();
}

async function makeDocx(text: string): Promise<Uint8Array> {
  const doc = new Document({ sections: [{ children: [new Paragraph({ children: [new TextRun(text)] })] }] });
  return new Uint8Array(await Packer.toBuffer(doc));
}

describe("document extraction", () => {
  it("extracts text from a text-based PDF", async () => {
    const res = await extractText("cv.pdf", await makePdf("Founded a community coding club in Lagos with sixty members"));
    expect(res.status).toBe("extracted");
    expect(res.text).toContain("community coding club");
    expect(res.pageCount).toBe(1);
    expect(res.wordCount).toBeGreaterThan(5);
    expect(res.sha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it("detects a scanned (image-only) PDF and asks for OCR instead of returning empty text", async () => {
    const res = await extractText("scan.pdf", await makePdf(null));
    expect(res.status).toBe("needs_ocr");
    expect(res.message).toMatch(/OCR/);
  });

  it("extracts text from DOCX and TXT", async () => {
    expect((await extractText("statement.docx", await makeDocx("My personal statement."))).text).toBe("My personal statement.");
    expect((await extractText("notes.txt", new TextEncoder().encode("Plain   text\r\n\r\n\r\nhere"))).text).toBe("Plain text\n\nhere");
  });

  it("rejects files whose content does not match their extension", async () => {
    expect(detectKind("fake.pdf", new TextEncoder().encode("hello"))).toBeNull();
    expect(detectKind("x.exe", new Uint8Array([1, 2]))).toBeNull();
    const res = await extractText("fake.docx", new TextEncoder().encode("not a zip"));
    expect(res.status).toBe("unsupported");
  });

  it("reports corrupt PDFs as failed with a next step", async () => {
    const res = await extractText("broken.pdf", new TextEncoder().encode("%PDF-1.7 garbage"));
    expect(res.status).toBe("failed");
    expect(res.message).toMatch(/paste the text/);
  });
});

describe("export generation", () => {
  const pieces = [{ title: "Leadership essay", doc: docFromSections([{ heading: "", paragraphs: ["First paragraph with café.", "Second paragraph."] }], false) }];
  const options = { ...DEFAULT_EXPORT_OPTIONS, documentTitle: "Leadership essay" };

  it("exports only the essay text by default", () => {
    expect(exportText(pieces, options)).toBe("First paragraph with café.\n\nSecond paragraph.\n");
  });

  it("produces a DOCX with the essay paragraphs and the chosen font, without extra commentary", async () => {
    const buf = await exportDocx(pieces, { ...options, font: "sans", fontSize: 11 });
    const zip = await JSZip.loadAsync(buf);
    const xml = await zip.file("word/document.xml")!.async("string");
    expect(xml).toContain("First paragraph with café.");
    expect(xml).toContain("Second paragraph.");
    const runs = [...xml.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((m) => m[1]);
    expect(runs).toEqual(["First paragraph with café.", "Second paragraph."]);
    const styles = await zip.file("word/styles.xml")!.async("string");
    expect(styles).toContain("Arial");
  });

  it("produces a valid PDF, with an optional cover page and multiple essays", async () => {
    const two = [...pieces, { title: "Career goals", doc: docFromSections([{ paragraphs: ["Goals."] }], false) }];
    const bytes = await exportPdf(two, { ...options, includeTitles: true, cover: { title: "Chevening 2027", author: "A. Applicant" } });
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBe(3);
    expect(pdf.getTitle()).toBe("Leadership essay");
  });

  it("creates safe file names", () => {
    expect(safeFileName("Leadership: Essay / Draft #2")).toBe("leadership-essay-draft-2");
    expect(safeFileName("???")).toBe("essay");
  });
});
