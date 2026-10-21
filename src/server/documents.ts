"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { withUser } from "@/lib/auth";
import { STORAGE_BUCKET } from "@/lib/domain/constants";
import { documentMetaSchema, nullify, type DocumentMetaInput } from "@/lib/domain/schemas";
import type { ActionResult, SupportingDocument } from "@/lib/domain/types";
import { mimeForExtension, ownsPath, storagePath, validateUploadMeta, type UploadMeta } from "@/lib/documents/upload";
import { countWords } from "@/lib/essay/doc";
import { downloadAndExtract } from "./internal/files";

const id = z.string().uuid();

/** Validates an upload and returns the private storage path the browser should upload to. */
export async function prepareUpload(meta: UploadMeta, folder: "documents" | "exemplars"): Promise<ActionResult<{ path: string }>> {
  const problem = validateUploadMeta(meta);
  if (problem) return { ok: false, error: problem, code: "validation" };
  if (folder !== "documents" && folder !== "exemplars") return { ok: false, error: "Invalid folder", code: "validation" };
  return withUser(async ({ user }) => ({ ok: true, data: { path: storagePath(user.id, folder, meta.name) } }));
}

export async function registerDocument(
  input: { path: string; fileName: string } & DocumentMetaInput,
): Promise<ActionResult<{ id: string; status: SupportingDocument["extraction_status"]; message: string | null }>> {
  const parsed = documentMetaSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input", code: "validation" };
  return withUser(async ({ supabase, user }) => {
    if (!ownsPath(user.id, input.path)) return { ok: false, error: "Invalid file reference.", code: "validation" };
    const file = await downloadAndExtract(supabase, input.path, input.fileName);
    if (!file) return { ok: false, error: "The uploaded file could not be found. Please upload it again." };
    const ex = file.extraction;
    const { data, error } = await supabase
      .from("supporting_documents")
      .insert({
        ...nullify(parsed.data),
        title: parsed.data.title,
        file_path: input.path,
        file_name: input.fileName.slice(0, 300),
        mime_type: mimeForExtension(input.fileName),
        size_bytes: file.size,
        content_sha256: ex.sha256,
        extraction_status: ex.status,
        extraction_error: ex.message,
        extracted_text: ex.text || null,
        page_count: ex.pageCount,
        word_count: ex.wordCount,
      })
      .select("id")
      .single<{ id: string }>();
    if (error || !data) {
      await supabase.storage.from(STORAGE_BUCKET).remove([input.path]);
      return { ok: false, error: "Could not save the document." };
    }
    revalidatePath("/documents");
    if (parsed.data.application_id) revalidatePath(`/applications/${parsed.data.application_id}`);
    return { ok: true, data: { id: data.id, status: ex.status, message: ex.message } };
  });
}

/** A document created from pasted text (e.g. when a scanned PDF cannot be read). */
export async function createTextDocument(input: DocumentMetaInput & { text: string }): Promise<ActionResult<{ id: string }>> {
  const parsed = documentMetaSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input", code: "validation" };
  const text = input.text.trim();
  if (!text || text.length > 400_000) return { ok: false, error: "Paste between 1 and 400,000 characters.", code: "validation" };
  return withUser(async ({ supabase }) => {
    const { data, error } = await supabase
      .from("supporting_documents")
      .insert({ ...nullify(parsed.data), title: parsed.data.title, extraction_status: "extracted", extracted_text: text, word_count: countWords(text) })
      .select("id")
      .single<{ id: string }>();
    if (error || !data) return { ok: false, error: "Could not save the document." };
    revalidatePath("/documents");
    return { ok: true, data: { id: data.id } };
  });
}

export async function updateDocument(documentId: string, input: DocumentMetaInput & { text?: string }): Promise<ActionResult> {
  const parsed = documentMetaSchema.safeParse(input);
  if (!id.safeParse(documentId).success) return { ok: false, error: "Not found", code: "not_found" };
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input", code: "validation" };
  return withUser(async ({ supabase }) => {
    const patch: Record<string, unknown> = { ...nullify(parsed.data), title: parsed.data.title };
    if (input.text !== undefined) {
        const text = input.text.trim().slice(0, 400_000);
      patch.extracted_text = text || null;
      patch.word_count = countWords(text);
      if (text) {
        patch.extraction_status = "extracted";
        patch.extraction_error = null;
      }
    }
    const { error } = await supabase.from("supporting_documents").update(patch).eq("id", documentId);
    if (error) return { ok: false, error: "Could not update the document." };
    revalidatePath("/documents");
    return { ok: true, data: undefined };
  });
}

/**
 * Deletes the record, its extracted text and the stored file. Links from essays cascade; profile
 * entries that cited it keep their text but lose the reference.
 */
export async function deleteDocument(documentId: string): Promise<ActionResult> {
  if (!id.safeParse(documentId).success) return { ok: false, error: "Not found", code: "not_found" };
  return withUser(async ({ supabase }) => {
    const { data: row } = await supabase.from("supporting_documents").select("file_path").eq("id", documentId).maybeSingle<{ file_path: string | null }>();
    if (!row) return { ok: false, error: "Document not found.", code: "not_found" };
    const { error } = await supabase.from("supporting_documents").delete().eq("id", documentId);
    if (error) return { ok: false, error: "Could not delete the document." };
    if (row.file_path) await supabase.storage.from(STORAGE_BUCKET).remove([row.file_path]);
    revalidatePath("/documents");
    return { ok: true, data: undefined };
  });
}

/** Short-lived signed URL for a private file. Storage RLS ensures only the owner can sign it. */
export async function getSignedFileUrl(path: string): Promise<ActionResult<{ url: string }>> {
  return withUser(async ({ supabase, user }) => {
    if (!ownsPath(user.id, path)) return { ok: false, error: "File not found.", code: "not_found" };
    const { data, error } = await supabase.storage.from(STORAGE_BUCKET).createSignedUrl(path, 60);
    if (error || !data) return { ok: false, error: "Could not open the file." };
    return { ok: true, data: { url: data.signedUrl } };
  });
}

export async function discardUpload(path: string): Promise<ActionResult> {
  return withUser(async ({ supabase, user }) => {
    if (!ownsPath(user.id, path)) return { ok: false, error: "File not found.", code: "not_found" };
    await supabase.storage.from(STORAGE_BUCKET).remove([path]);
    return { ok: true, data: undefined };
  });
}
