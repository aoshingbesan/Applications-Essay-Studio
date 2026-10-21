"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { withUser, getSessionUser } from "@/lib/auth";
import { STORAGE_BUCKET } from "@/lib/domain/constants";
import { exportSettingsSchema, nullify, profileSchema, writingPreferencesSchema, type ProfileInput, type WritingPreferencesInput } from "@/lib/domain/schemas";
import type { ActionResult, ExportSettings } from "@/lib/domain/types";
import type { ServerSupabase } from "@/lib/supabase/server";

const LETTER_STUDIO_BUCKET = "documents";

export async function updateProfile(input: ProfileInput): Promise<ActionResult> {
  const parsed = profileSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input", code: "validation" };
  return withUser(async ({ supabase, user }) => {
    const { error } = await supabase.from("profiles").upsert({ id: user.id, ...nullify(parsed.data) });
    if (error) return { ok: false, error: "Could not save your profile." };
    revalidatePath("/settings");
    revalidatePath("/");
    return { ok: true, data: undefined };
  });
}

export async function updateDefaultPreferences(input: WritingPreferencesInput): Promise<ActionResult> {
  const parsed = writingPreferencesSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input", code: "validation" };
  return withUser(async ({ supabase, user }) => {
    const { error } = await supabase.from("profiles").update({ writing_preferences: parsed.data }).eq("id", user.id);
    if (error) return { ok: false, error: "Could not save your writing preferences." };
    revalidatePath("/settings");
    return { ok: true, data: undefined };
  });
}

export async function updateExportSettings(input: ExportSettings): Promise<ActionResult> {
  const parsed = exportSettingsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid export settings", code: "validation" };
  return withUser(async ({ supabase, user }) => {
    const { error } = await supabase.from("profiles").update({ export_settings: parsed.data }).eq("id", user.id);
    if (error) return { ok: false, error: "Could not save the export settings." };
    revalidatePath("/settings");
    return { ok: true, data: undefined };
  });
}

export async function setAiEnabled(enabled: boolean): Promise<ActionResult> {
  return withUser(async ({ supabase, user }) => {
    const { error } = await supabase.from("profiles").update({ ai_enabled: Boolean(enabled) }).eq("id", user.id);
    if (error) return { ok: false, error: "Could not update the AI setting." };
    revalidatePath("/", "layout");
    return { ok: true, data: undefined };
  });
}

export async function signOut() {
  const { supabase } = await getSessionUser();
  await supabase.auth.signOut();
  redirect("/login");
}

async function removeAllFiles(supabase: ServerSupabase, userId: string) {
  // Storage objects are not removed by database cascades, so delete them explicitly.
  for (const folder of ["documents", "exemplars"]) {
    for (let page = 0; page < 100; page++) {
      const { data } = await supabase.storage.from(STORAGE_BUCKET).list(`${userId}/${folder}`, { limit: 100 });
      if (!data || data.length === 0) break;
      await supabase.storage.from(STORAGE_BUCKET).remove(data.map((f) => `${userId}/${folder}/${f.name}`));
    }
  }
}

/** Deletes every record and file the user owns, keeping the account itself. */
export async function deleteAllData(confirmation: string): Promise<ActionResult> {
  if (confirmation !== "DELETE") return { ok: false, error: 'Type "DELETE" to confirm.', code: "validation" };
  return withUser(async ({ supabase, user }) => {
    for (const table of ["applications", "exemplars", "story_bank_items", "personal_evidence", "supporting_documents", "ai_generation_jobs"] as const) {
      const { error } = await supabase.from(table).delete().eq("user_id", user.id);
      if (error) return { ok: false, error: "Could not delete all data. Some records may remain; please try again." };
    }
    await removeAllFiles(supabase, user.id);
    revalidatePath("/", "layout");
    return { ok: true, data: undefined };
  });
}

/** Letter Studio keeps its files directly under "<user id>/" in its own "documents" bucket. */
async function removeLetterStudioFiles(supabase: ServerSupabase, userId: string) {
  for (let page = 0; page < 50; page++) {
    const { data, error } = await supabase.storage.from(LETTER_STUDIO_BUCKET).list(userId, { limit: 100 });
    if (error || !data || data.length === 0) return;
    await supabase.storage.from(LETTER_STUDIO_BUCKET).remove(data.map((f) => `${userId}/${f.name}`));
  }
}

/**
 * Permanently deletes the account, then signs out. The account is shared with Recommendation
 * Letter Studio, so both apps' data (database rows cascade) and stored files are removed.
 */
export async function deleteAccount(confirmation: string): Promise<ActionResult> {
  if (confirmation !== "DELETE") return { ok: false, error: 'Type "DELETE" to confirm.', code: "validation" };
  const result = await withUser<undefined>(async ({ supabase, user }) => {
    await removeAllFiles(supabase, user.id);
    await removeLetterStudioFiles(supabase, user.id);
    const { error } = await supabase.rpc("delete_my_account");
    if (error) return { ok: false, error: "Could not delete your account. Please try again." };
    await supabase.auth.signOut();
    return { ok: true, data: undefined };
  });
  if (result.ok) redirect("/login?deleted=1");
  return result;
}
