"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { withUser } from "@/lib/auth";
import { evidenceSchema, nullify, storySchema, type EvidenceInput, type StoryInput } from "@/lib/domain/schemas";
import type { ActionResult } from "@/lib/domain/types";

const id = z.string().uuid();
const invalid = (e: z.ZodError): ActionResult<never> => ({ ok: false, error: e.issues[0]?.message ?? "Invalid input", code: "validation" });
const notFound: ActionResult<never> = { ok: false, error: "Not found", code: "not_found" };

// ---------------------------------------------------------------------------
// Personal profile evidence
// ---------------------------------------------------------------------------

export async function saveEvidence(evidenceId: string | null, input: EvidenceInput, sourceDocumentId?: string | null): Promise<ActionResult<{ id: string }>> {
  const parsed = evidenceSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  if (evidenceId && !id.safeParse(evidenceId).success) return notFound;
  if (sourceDocumentId && !id.safeParse(sourceDocumentId).success) return { ok: false, error: "Invalid document", code: "validation" };
  return withUser(async ({ supabase }) => {
    const row: Record<string, unknown> = { ...nullify(parsed.data), section: parsed.data.section, title: parsed.data.title, classification: parsed.data.classification };
    if (sourceDocumentId !== undefined) row.source_document_id = sourceDocumentId;
    const query = evidenceId
      ? supabase.from("personal_evidence").update(row).eq("id", evidenceId).select("id").single<{ id: string }>()
      : supabase.from("personal_evidence").insert(row).select("id").single<{ id: string }>();
    const { data, error } = await query;
    if (error || !data) return { ok: false, error: "Could not save the entry." };
    revalidatePath("/profile");
    return { ok: true, data: { id: data.id } };
  });
}

export async function setEvidenceArchived(evidenceId: string, archived: boolean): Promise<ActionResult> {
  if (!id.safeParse(evidenceId).success) return notFound;
  return withUser(async ({ supabase }) => {
    const { error } = await supabase.from("personal_evidence").update({ archived_at: archived ? new Date().toISOString() : null }).eq("id", evidenceId);
    if (error) return { ok: false, error: "Could not update the entry." };
    revalidatePath("/profile");
    return { ok: true, data: undefined };
  });
}

export async function deleteEvidence(evidenceId: string): Promise<ActionResult> {
  if (!id.safeParse(evidenceId).success) return notFound;
  return withUser(async ({ supabase }) => {
    const { error } = await supabase.from("personal_evidence").delete().eq("id", evidenceId);
    if (error) return { ok: false, error: "Could not delete the entry." };
    revalidatePath("/profile");
    return { ok: true, data: undefined };
  });
}

// ---------------------------------------------------------------------------
// Story bank
// ---------------------------------------------------------------------------

export async function saveStory(storyId: string | null, input: StoryInput): Promise<ActionResult<{ id: string }>> {
  const parsed = storySchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  if (storyId && !id.safeParse(storyId).success) return notFound;
  return withUser(async ({ supabase }) => {
    const row = { ...nullify(parsed.data), title: parsed.data.title, verification_status: parsed.data.verification_status, skills: parsed.data.skills, related_criteria: parsed.data.related_criteria, tags: parsed.data.tags };
    const query = storyId
      ? supabase.from("story_bank_items").update(row).eq("id", storyId).select("id").single<{ id: string }>()
      : supabase.from("story_bank_items").insert(row).select("id").single<{ id: string }>();
    const { data, error } = await query;
    if (error || !data) return { ok: false, error: "Could not save the story." };
    revalidatePath("/stories");
    revalidatePath(`/stories/${data.id}`);
    return { ok: true, data: { id: data.id } };
  });
}

export async function setStoryArchived(storyId: string, archived: boolean): Promise<ActionResult> {
  if (!id.safeParse(storyId).success) return notFound;
  return withUser(async ({ supabase }) => {
    const { error } = await supabase.from("story_bank_items").update({ archived_at: archived ? new Date().toISOString() : null }).eq("id", storyId);
    if (error) return { ok: false, error: "Could not update the story." };
    revalidatePath("/stories");
    revalidatePath(`/stories/${storyId}`);
    return { ok: true, data: undefined };
  });
}

export async function deleteStory(storyId: string): Promise<ActionResult> {
  if (!id.safeParse(storyId).success) return notFound;
  return withUser(async ({ supabase }) => {
    const { error } = await supabase.from("story_bank_items").delete().eq("id", storyId);
    if (error) return { ok: false, error: "Could not delete the story." };
    revalidatePath("/stories");
    return { ok: true, data: undefined };
  });
}
