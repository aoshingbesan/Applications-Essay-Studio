import { DOCUMENT_EXTENSIONS, DOCUMENT_MIME_TYPES, UPLOAD_MAX_BYTES } from "@/lib/domain/constants";

export interface UploadMeta {
  name: string;
  size: number;
  type: string;
}

/** Validates name, extension, declared MIME type and size before anything is uploaded. */
export function validateUploadMeta(meta: UploadMeta): string | null {
  if (!meta.name || meta.name.length > 300) return "The file name is missing or too long.";
  if (!Number.isFinite(meta.size) || meta.size <= 0) return "The file is empty.";
  if (meta.size > UPLOAD_MAX_BYTES) return "Files must be 10 MB or smaller.";
  const ext = `.${meta.name.toLowerCase().split(".").pop()}`;
  if (!(DOCUMENT_EXTENSIONS as readonly string[]).includes(ext)) return "Upload a PDF, Word (.docx) or plain-text (.txt) file.";
  // Some browsers report no MIME type for .docx; the server verifies the content itself after upload.
  if (meta.type && !(DOCUMENT_MIME_TYPES as readonly string[]).includes(meta.type)) return "Upload a PDF, Word (.docx) or plain-text (.txt) file.";
  return null;
}

export function mimeForExtension(name: string): string {
  const ext = name.toLowerCase().split(".").pop();
  if (ext === "pdf") return "application/pdf";
  if (ext === "docx") return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  return "text/plain";
}

/** Storage path under the owner's folder; RLS on storage only allows "<user id>/…". */
export function storagePath(userId: string, folder: "documents" | "exemplars", name: string): string {
  const safeName = name.normalize("NFKD").replace(/[^\w.-]+/g, "_").slice(-120) || "file";
  return `${userId}/${folder}/${crypto.randomUUID()}-${safeName}`;
}

export function ownsPath(userId: string, path: string): boolean {
  return path.startsWith(`${userId}/`) && !path.includes("..");
}
