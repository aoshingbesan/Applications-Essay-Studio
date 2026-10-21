"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { withUser } from "@/lib/auth";
import { EXEMPLAR_ASPECTS, STORAGE_BUCKET, type ExemplarAspect } from "@/lib/domain/constants";
import { exemplarMetaSchema, type ExemplarMetaInput } from "@/lib/domain/schemas";
import type { ActionResult, Exemplar } from "@/lib/domain/types";
import { countWords } from "@/lib/essay/doc";
import { normaliseText } from "@/lib/documents/extract";
import { mimeForExtension, ownsPath } from "@/lib/documents/upload";
import { downloadAndExtract } from "./internal/files";

const id = z.string().uuid();
const notFound: ActionResult<never> = { ok: false, error: "Not found", code: "not_found" };
const PERMISSION_REQUIRED: ActionResult<never> = {
  ok: false,
  error: "Confirm that you have permission to use this essay and have removed other people's personal information.",
  code: "validation",
};
const MAX_TEXT = 200_000;

function metaRow(v: z.output<typeof exemplarMetaSchema>) {
  return {
    title: v.title,
    essay_category: v.essay_category,
    institution: v.institution || null,
    programme: v.programme || null,
    author_attribution: v.author_attribution || null,
    original_prompt: v.original_prompt || null,
    original_word_limit: v.original_word_limit,
    application_year: v.application_year,
    source_url: v.source_url || null,
    provenance: v.provenance,
    notes: v.notes || null,
    tags: v.tags,
  };
}

export async function createExemplarFromUpload(input: {
  path: string;
  fileName: string;
  meta: ExemplarMetaInput;
  permissionConfirmed: boolean;
}): Promise<ActionResult<{ id: string; status: Exemplar["extraction_status"]; message: string | null }>> {
  const parsed = exemplarMetaSchema.safeParse(input.meta);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input", code: "validation" };
  if (!input.permissionConfirmed) return PERMISSION_REQUIRED;
  return withUser(async ({ supabase, user }) => {
    if (!ownsPath(user.id, input.path)) return { ok: false, error: "Invalid file reference.", code: "validation" };
    const file = await downloadAndExtract(supabase, input.path, input.fileName);
    if (!file) return { ok: false, error: "The uploaded file could not be found. Please upload it again." };
    const ex = file.extraction;
    const text = ex.text.slice(0, MAX_TEXT);
    const { data, error } = await supabase
      .from("exemplars")
      .insert({
        ...metaRow(parsed.data),
        file_path: input.path,
        file_name: input.fileName.slice(0, 300),
        mime_type: mimeForExtension(input.fileName),
        size_bytes: file.size,
        source_text: ex.status === "extracted" ? text : "",
        word_count: ex.status === "extracted" ? ex.wordCount : 0,
        extraction_status: ex.status,
        extraction_error: ex.message,
        permission_confirmed_at: new Date().toISOString(),
      })
      .select("id")
      .single<{ id: string }>();
    if (error || !data) {
      await supabase.storage.from(STORAGE_BUCKET).remove([input.path]);
      return { ok: false, error: "Could not save the exemplar." };
    }
    revalidatePath("/exemplars");
    return { ok: true, data: { id: data.id, status: ex.status, message: ex.message } };
  });
}

export async function createExemplarFromText(input: { text: string; meta: ExemplarMetaInput; permissionConfirmed: boolean }): Promise<ActionResult<{ id: string }>> {
  const parsed = exemplarMetaSchema.safeParse(input.meta);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input", code: "validation" };
  if (!input.permissionConfirmed) return PERMISSION_REQUIRED;
  const text = normaliseText(input.text);
  if (countWords(text) < 50) return { ok: false, error: "Paste the full essay (at least 50 words).", code: "validation" };
  if (text.length > MAX_TEXT) return { ok: false, error: "The essay is too long.", code: "validation" };
  return withUser(async ({ supabase }) => {
    const { data, error } = await supabase
      .from("exemplars")
      .insert({ ...metaRow(parsed.data), source_text: text, word_count: countWords(text), extraction_status: "extracted", permission_confirmed_at: new Date().toISOString() })
      .select("id")
      .single<{ id: string }>();
    if (error || !data) return { ok: false, error: "Could not save the exemplar." };
    revalidatePath("/exemplars");
    return { ok: true, data: { id: data.id } };
  });
}

export async function updateExemplarMeta(exemplarId: string, meta: ExemplarMetaInput): Promise<ActionResult> {
  const parsed = exemplarMetaSchema.safeParse(meta);
  if (!id.safeParse(exemplarId).success) return notFound;
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input", code: "validation" };
  return withUser(async ({ supabase }) => {
    const { error } = await supabase.from("exemplars").update(metaRow(parsed.data)).eq("id", exemplarId);
    if (error) return { ok: false, error: "Could not save the details." };
    revalidatePath("/exemplars");
    revalidatePath(`/exemplars/${exemplarId}`);
    return { ok: true, data: undefined };
  });
}

/**
 * Replaces the essay text (e.g. to fix extraction errors or redact third-party details). The new
 * text gets a new hash, so existing analyses no longer match it and are shown as out of date.
 */
export async function replaceExemplarText(exemplarId: string, text: string): Promise<ActionResult> {
  if (!id.safeParse(exemplarId).success) return notFound;
  const clean = normaliseText(text);
  if (countWords(clean) < 50) return { ok: false, error: "The essay must be at least 50 words.", code: "validation" };
  if (clean.length > MAX_TEXT) return { ok: false, error: "The essay is too long.", code: "validation" };
  return withUser(async ({ supabase }) => {
    const { error } = await supabase
      .from("exemplars")
      .update({ source_text: clean, word_count: countWords(clean), extraction_status: "extracted", extraction_error: null })
      .eq("id", exemplarId);
    if (error) return { ok: false, error: "Could not save the text." };
    revalidatePath(`/exemplars/${exemplarId}`);
    return { ok: true, data: undefined };
  });
}

export async function setExemplarArchived(exemplarId: string, archived: boolean): Promise<ActionResult> {
  if (!id.safeParse(exemplarId).success) return notFound;
  return withUser(async ({ supabase }) => {
    const { error } = await supabase.from("exemplars").update({ archived_at: archived ? new Date().toISOString() : null }).eq("id", exemplarId);
    if (error) return { ok: false, error: "Could not update the exemplar." };
    revalidatePath("/exemplars");
    revalidatePath(`/exemplars/${exemplarId}`);
    return { ok: true, data: undefined };
  });
}

/** Deletes the exemplar, its file, its cached analyses, selected lessons and application links. */
export async function deleteExemplar(exemplarId: string): Promise<ActionResult> {
  if (!id.safeParse(exemplarId).success) return notFound;
  return withUser(async ({ supabase }) => {
    const { data: row } = await supabase.from("exemplars").select("file_path").eq("id", exemplarId).maybeSingle<{ file_path: string | null }>();
    if (!row) return notFound;
    const { error } = await supabase.from("exemplars").delete().eq("id", exemplarId);
    if (error) return { ok: false, error: "Could not delete the exemplar." };
    if (row.file_path) await supabase.storage.from(STORAGE_BUCKET).remove([row.file_path]);
    revalidatePath("/exemplars");
    return { ok: true, data: undefined };
  });
}

export async function setExemplarLink(exemplarId: string, applicationId: string, linked: boolean): Promise<ActionResult> {
  if (!id.safeParse(exemplarId).success || !id.safeParse(applicationId).success) return notFound;
  return withUser(async ({ supabase }) => {
    const { error } = linked
      ? await supabase.from("exemplar_application_links").upsert({ exemplar_id: exemplarId, application_id: applicationId })
      : await supabase.from("exemplar_application_links").delete().eq("exemplar_id", exemplarId).eq("application_id", applicationId);
    if (error) return { ok: false, error: "Could not update the link." };
    revalidatePath(`/exemplars/${exemplarId}`);
    revalidatePath(`/applications/${applicationId}`);
    return { ok: true, data: undefined };
  });
}

const lessonInput = z.object({
  essayId: z.string().uuid(),
  exemplarId: z.string().uuid(),
  analysisId: z.string().uuid(),
  aspect: z.enum([...EXEMPLAR_ASPECTS, "lesson"]),
  lessonKey: z.string().min(1).max(100),
  content: z.string().trim().min(1).max(4000),
});

/** Selects (or deselects) one lesson from an analysis for use in an essay. Content is copied. */
export async function setLessonSelected(input: z.input<typeof lessonInput>, selected: boolean): Promise<ActionResult> {
  const parsed = lessonInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid lesson", code: "validation" };
  const v = parsed.data;
  return withUser(async ({ supabase }) => {
    if (selected) {
      const { error } = await supabase.from("exemplar_selected_lessons").upsert(
        { essay_id: v.essayId, exemplar_id: v.exemplarId, analysis_id: v.analysisId, aspect: v.aspect, lesson_key: v.lessonKey, content: v.content },
        { onConflict: "essay_id,exemplar_id,lesson_key", ignoreDuplicates: true },
      );
      if (error) return { ok: false, error: "Could not select the lesson." };
      // Choosing a lesson for an essay is an explicit opt-in to exemplar guidance for it.
      await supabase.from("essays").update({ use_exemplars: true }).eq("id", v.essayId);
    } else {
      const { error } = await supabase.from("exemplar_selected_lessons").delete().eq("essay_id", v.essayId).eq("exemplar_id", v.exemplarId).eq("lesson_key", v.lessonKey);
      if (error) return { ok: false, error: "Could not remove the lesson." };
    }
    revalidatePath(`/studio/${v.essayId}`);
    revalidatePath(`/exemplars/${v.exemplarId}`);
    return { ok: true, data: undefined };
  });
}

export async function removeSelectedLesson(lessonId: string): Promise<ActionResult> {
  if (!id.safeParse(lessonId).success) return notFound;
  return withUser(async ({ supabase }) => {
    const { error } = await supabase.from("exemplar_selected_lessons").delete().eq("id", lessonId);
    if (error) return { ok: false, error: "Could not remove the lesson." };
    return { ok: true, data: undefined };
  });
}

export async function setEssayExemplarSettings(essayId: string, useExemplars: boolean, aspects: ExemplarAspect[]): Promise<ActionResult> {
  if (!id.safeParse(essayId).success) return notFound;
  const valid = aspects.filter((a) => (EXEMPLAR_ASPECTS as readonly string[]).includes(a));
  return withUser(async ({ supabase }) => {
    const { error } = await supabase.from("essays").update({ use_exemplars: useExemplars, exemplar_aspects: valid }).eq("id", essayId);
    if (error) return { ok: false, error: "Could not save the exemplar settings." };
    revalidatePath(`/studio/${essayId}`);
    return { ok: true, data: undefined };
  });
}
