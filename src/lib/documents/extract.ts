// Text extraction for uploaded PDF, DOCX and TXT files. Runs on the server only.
// Scanned PDFs have no text layer: they are reported as needing OCR rather than treated as empty.

import { createHash } from "node:crypto";
import { countWords } from "@/lib/essay/doc";
import type { ExtractionStatus } from "@/lib/domain/constants";

export interface ExtractionResult {
  status: Exclude<ExtractionStatus, "pending">;
  text: string;
  pageCount: number | null;
  wordCount: number;
  sha256: string;
  /** A user-facing explanation with a next step, when extraction did not fully succeed. */
  message: string | null;
}

export type FileKind = "pdf" | "docx" | "txt";

const MAX_TEXT_CHARS = 400_000;
/** Below this many characters per page a PDF is almost certainly a scan or image-only. */
const MIN_CHARS_PER_PAGE = 40;

const PDF_MAGIC = "%PDF-";
const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04];

/** Determines the file kind from its extension AND verifies the content matches. */
export function detectKind(fileName: string, bytes: Uint8Array): FileKind | null {
  const ext = fileName.toLowerCase().split(".").pop();
  const head = new TextDecoder("latin1").decode(bytes.slice(0, 5));
  if (ext === "pdf") return head === PDF_MAGIC ? "pdf" : null;
  if (ext === "docx") return ZIP_MAGIC.every((b, i) => bytes[i] === b) ? "docx" : null;
  if (ext === "txt") return bytes.slice(0, 4096).includes(0) ? null : "txt";
  return null;
}

export function normaliseText(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/\u0000/g, "")
    .replace(/[ \t\f\v]+\n/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, MAX_TEXT_CHARS);
}

function result(status: ExtractionResult["status"], text: string, pageCount: number | null, sha256: string, message: string | null): ExtractionResult {
  const clean = normaliseText(text);
  return { status, text: clean, pageCount, wordCount: countWords(clean), sha256, message };
}

export async function extractText(fileName: string, bytes: Uint8Array): Promise<ExtractionResult> {
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const kind = detectKind(fileName, bytes);
  if (!kind) {
    return result("unsupported", "", null, sha256, "This file's contents do not match a PDF, Word (.docx) or plain-text file. Save it in one of those formats and upload it again.");
  }

  if (kind === "txt") {
    const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
    return result("extracted", text, null, sha256, null);
  }

  if (kind === "docx") {
    try {
      const mammoth = await import("mammoth");
      const { value } = await mammoth.extractRawText({ buffer: Buffer.from(bytes) });
      if (!value.trim()) return result("unsupported", "", null, sha256, "No text was found in this Word document. If it contains only images, paste the text instead.");
      return result("extracted", value, null, sha256, null);
    } catch {
      return result("failed", "", null, sha256, "This Word document could not be read. It may be corrupted or password-protected. Re-save it in Word and upload it again, or paste the text.");
    }
  }

  try {
    const { extractText: extractPdf, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(new Uint8Array(bytes));
    const { totalPages, text } = await extractPdf(pdf, { mergePages: false });
    const joined = text.join("\n\n");
    const meaningful = joined.replace(/\s+/g, "").length;
    if (meaningful < MIN_CHARS_PER_PAGE * Math.max(1, totalPages) * 0.25) {
      return result(
        "needs_ocr",
        joined,
        totalPages,
        sha256,
        "This PDF appears to be scanned or image-only, so it has no readable text. Essay Studio does not run OCR. Export a text-based PDF from the original document, run it through an OCR tool, or paste the text instead.",
      );
    }
    return result("extracted", joined, totalPages, sha256, null);
  } catch (error) {
    const name = error instanceof Error ? error.name : "";
    if (name === "PasswordException" || /password/i.test(error instanceof Error ? error.message : "")) {
      return result("failed", "", null, sha256, "This PDF is password-protected or encrypted. Remove the protection, upload it again, or paste the text.");
    }
    return result("failed", "", null, sha256, "This PDF could not be read. It may be damaged. Try re-exporting it, or paste the text instead.");
  }
}
