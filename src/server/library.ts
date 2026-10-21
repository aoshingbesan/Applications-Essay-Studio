"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { withUser } from "@/lib/auth";
import { entrySchema, nullify, type EntryInput } from "@/lib/domain/schemas";
import type { ActionResult } from "@/lib/domain/types";
import { ENTRY_SECTIONS, PRIVACY_LEVELS, type EntrySection, type Privacy } from "@/lib/library/sections";

const id = z.string().uuid();
const notFound: ActionResult<never> = { ok: false, error: "Not found", code: "not_found" };

function revalidateLibrary(section?: string, entryId?: string) {
  revalidatePath("/library");
  if (section) revalidatePath(`/library/${section}`);
  if (entryId) revalidatePath(`/library/entry/${entryId}`);
}

/** Creates or updates an entry and replaces the set of documents that substantiate it. */
export async function saveEntry(entryId: string | null, input: EntryInput, documentIds?: string[]): Promise<ActionResult<{ id: string }>> {
  const parsed = entrySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input", code: "validation" };
  if (entryId && !id.safeParse(entryId).success) return notFound;
  const docs = documentIds === undefined ? undefined : z.array(id).max(50).safeParse(Array.from(new Set(documentIds)));
  if (docs && !docs.success) return { ok: false, error: "Invalid documents", code: "validation" };
  return withUser(async ({ supabase }) => {
    const v = parsed.data;
    const row = {
      ...nullify(v),
      section: v.section,
      also_in: v.also_in,
      title: v.title,
      skills: v.skills,
      related_criteria: v.related_criteria,
      tags: v.tags,
      classification: v.classification,
      privacy: v.privacy,
    };
    const query = entryId
      ? supabase.from("library_entries").update(row).eq("id", entryId).select("id").single<{ id: string }>()
      : supabase.from("library_entries").insert(row).select("id").single<{ id: string }>();
    const { data, error } = await query;
    if (error || !data) return { ok: false, error: "Could not save the entry." };

    if (docs?.success) {
      const { data: current } = await supabase.from("entry_documents").select("document_id").eq("entry_id", data.id).returns<{ document_id: string }[]>();
      const existing = new Set((current ?? []).map((r) => r.document_id));
      const wanted = new Set(docs.data);
      const remove = [...existing].filter((d) => !wanted.has(d));
      const add = [...wanted].filter((d) => !existing.has(d));
      if (remove.length) await supabase.from("entry_documents").delete().eq("entry_id", data.id).in("document_id", remove);
      if (add.length) {
        const { error: linkError } = await supabase.from("entry_documents").insert(add.map((document_id) => ({ entry_id: data.id, document_id })));
        if (linkError) return { ok: false, error: "Saved, but the supporting documents could not be linked." };
      }
    }
    revalidateLibrary(v.section, data.id);
    return { ok: true, data: { id: data.id } };
  });
}

export async function setEntryPrivacy(entryId: string, privacy: Privacy): Promise<ActionResult> {
  if (!id.safeParse(entryId).success || !(PRIVACY_LEVELS as readonly string[]).includes(privacy)) return notFound;
  return withUser(async ({ supabase }) => {
    const { data, error } = await supabase.from("library_entries").update({ privacy }).eq("id", entryId).select("section").maybeSingle<{ section: string }>();
    if (error || !data) return { ok: false, error: "Could not update the privacy setting." };
    revalidateLibrary(data.section, entryId);
    return { ok: true, data: undefined };
  });
}

/** Sets a section's default privacy for new entries; optionally applies it to the section's existing entries. */
export async function setSectionPrivacy(section: EntrySection, privacy: Privacy, applyToExisting: boolean): Promise<ActionResult> {
  if (!(ENTRY_SECTIONS as readonly string[]).includes(section) || !(PRIVACY_LEVELS as readonly string[]).includes(privacy)) return notFound;
  return withUser(async ({ supabase, user }) => {
    const { error } = await supabase.from("library_section_settings").upsert({ user_id: user.id, section, default_privacy: privacy }, { onConflict: "user_id,section" });
    if (error) return { ok: false, error: "Could not save the section setting." };
    if (applyToExisting) {
      const { error: updateError } = await supabase.from("library_entries").update({ privacy }).eq("section", section);
      if (updateError) return { ok: false, error: "Saved the default, but existing entries could not be updated." };
    }
    revalidateLibrary(section);
    return { ok: true, data: undefined };
  });
}

/** Adds an answer to a guided question to the entry's narrative, keeping the question for context. */
export async function appendToNarrative(entryId: string, question: string, answer: string): Promise<ActionResult> {
  const q = question.trim().slice(0, 500);
  const a = answer.trim();
  if (!id.safeParse(entryId).success) return notFound;
  if (!a || a.length > 5000) return { ok: false, error: "Write an answer of up to 5,000 characters.", code: "validation" };
  return withUser(async ({ supabase }) => {
    const { data: entry } = await supabase.from("library_entries").select("narrative, section").eq("id", entryId).maybeSingle<{ narrative: string | null; section: string }>();
    if (!entry) return notFound;
    const narrative = [entry.narrative?.trim(), q ? `${q}\n${a}` : a].filter(Boolean).join("\n\n").slice(0, 30000);
    const { error } = await supabase.from("library_entries").update({ narrative }).eq("id", entryId);
    if (error) return { ok: false, error: "Could not save your answer." };
    revalidateLibrary(entry.section, entryId);
    return { ok: true, data: undefined };
  });
}

export async function setEntryArchived(entryId: string, archived: boolean): Promise<ActionResult> {
  if (!id.safeParse(entryId).success) return notFound;
  return withUser(async ({ supabase }) => {
    const { data, error } = await supabase
      .from("library_entries")
      .update({ archived_at: archived ? new Date().toISOString() : null })
      .eq("id", entryId)
      .select("section")
      .maybeSingle<{ section: string }>();
    if (error || !data) return { ok: false, error: "Could not update the entry." };
    revalidateLibrary(data.section, entryId);
    return { ok: true, data: undefined };
  });
}

/** Deletes the entry; its links to essays and documents go with it. Documents themselves are kept. */
export async function deleteEntry(entryId: string): Promise<ActionResult> {
  if (!id.safeParse(entryId).success) return notFound;
  return withUser(async ({ supabase }) => {
    const { error } = await supabase.from("library_entries").delete().eq("id", entryId);
    if (error) return { ok: false, error: "Could not delete the entry." };
    revalidateLibrary();
    return { ok: true, data: undefined };
  });
}
