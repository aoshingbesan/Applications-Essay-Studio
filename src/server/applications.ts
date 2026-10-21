"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { withUser } from "@/lib/auth";
import {
  applicationRequirementsSchema,
  essayRequirementSchema,
  essayStatusSchema,
  nullify,
  opportunitySchema,
  requirementItemSchema,
  writingPreferencesSchema,
  type ApplicationRequirementsInput,
  type EssayRequirementInput,
  type OpportunityInput,
  type RequirementItemInput,
  type WritingPreferencesInput,
} from "@/lib/domain/schemas";
import type { ActionResult, Application, Essay } from "@/lib/domain/types";
import type { EssayStatus } from "@/lib/domain/constants";

const id = z.string().uuid();
const invalid = (e: z.ZodError): ActionResult<never> => ({ ok: false, error: e.issues[0]?.message ?? "Invalid input", code: "validation" });
const notFound: ActionResult<never> = { ok: false, error: "Not found", code: "not_found" };

function revalidateApp(appId: string) {
  revalidatePath("/");
  revalidatePath("/applications");
  revalidatePath(`/applications/${appId}`);
}

function opportunityRow(v: OpportunityInput) {
  return {
    institution: v.institution,
    programme: v.programme,
    name: v.name || `${v.programme} — ${v.institution}`.slice(0, 300),
    category: v.category,
    country: v.country || null,
    official_url: v.official_url || null,
    deadline: v.deadline ? new Date(v.deadline).toISOString() : null,
    course_description: v.course_description || null,
    reason_for_applying: v.reason_for_applying || null,
  };
}

/** Step 1 of the wizard creates the application so progress is saved from the start. */
export async function createApplication(input: OpportunityInput): Promise<ActionResult<{ id: string }>> {
  const parsed = opportunitySchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  return withUser(async ({ supabase }) => {
    // New applications start from the user's default writing preferences.
    const { data: profile } = await supabase.from("profiles").select("writing_preferences").maybeSingle<{ writing_preferences: Record<string, unknown> }>();
    const { data, error } = await supabase
      .from("applications")
      .insert({ ...opportunityRow(parsed.data), writing_preferences: profile?.writing_preferences ?? {}, setup_step: 2 })
      .select("id")
      .single<{ id: string }>();
    if (error || !data) return { ok: false, error: "Could not create the application." };
    revalidateApp(data.id);
    return { ok: true, data: { id: data.id } };
  });
}

export async function updateOpportunity(appId: string, input: OpportunityInput): Promise<ActionResult> {
  const parsed = opportunitySchema.safeParse(input);
  if (!id.safeParse(appId).success) return notFound;
  if (!parsed.success) return invalid(parsed.error);
  return withUser(async ({ supabase }) => {
    const { error } = await supabase.from("applications").update(opportunityRow(parsed.data)).eq("id", appId);
    if (error) return { ok: false, error: "Could not save the application." };
    revalidateApp(appId);
    return { ok: true, data: undefined };
  });
}

export async function updateApplicationRequirements(appId: string, input: ApplicationRequirementsInput): Promise<ActionResult> {
  const parsed = applicationRequirementsSchema.safeParse(input);
  if (!id.safeParse(appId).success) return notFound;
  if (!parsed.success) return invalid(parsed.error);
  return withUser(async ({ supabase }) => {
    const { error } = await supabase.from("applications").update(nullify(parsed.data)).eq("id", appId);
    if (error) return { ok: false, error: "Could not save the requirements." };
    revalidateApp(appId);
    return { ok: true, data: undefined };
  });
}

export async function updateWritingPreferences(appId: string, input: WritingPreferencesInput): Promise<ActionResult> {
  const parsed = writingPreferencesSchema.safeParse(input);
  if (!id.safeParse(appId).success) return notFound;
  if (!parsed.success) return invalid(parsed.error);
  return withUser(async ({ supabase }) => {
    const { error } = await supabase.from("applications").update({ writing_preferences: parsed.data }).eq("id", appId);
    if (error) return { ok: false, error: "Could not save the writing preferences." };
    revalidateApp(appId);
    return { ok: true, data: undefined };
  });
}

/** Records how far through the wizard the user is, so they can resume later. */
export async function setSetupStep(appId: string, step: number, complete = false): Promise<ActionResult> {
  if (!id.safeParse(appId).success) return notFound;
  if (!Number.isInteger(step) || step < 1 || step > 4) return { ok: false, error: "Invalid step", code: "validation" };
  return withUser(async ({ supabase }) => {
    // Progress only moves forward, so revisiting an earlier step never loses the furthest step reached.
    const { data: current } = await supabase.from("applications").select("setup_step").eq("id", appId).maybeSingle<{ setup_step: number }>();
    if (!current) return notFound;
    const patch: Record<string, unknown> = { setup_step: Math.max(step, current.setup_step) };
    if (complete) patch.setup_completed_at = new Date().toISOString();
    const { error } = await supabase.from("applications").update(patch).eq("id", appId);
    if (error) return { ok: false, error: "Could not save your progress." };
    revalidateApp(appId);
    return { ok: true, data: undefined };
  });
}

export async function updateApplicationNotes(appId: string, notes: string): Promise<ActionResult> {
  if (!id.safeParse(appId).success) return notFound;
  if (notes.length > 30000) return { ok: false, error: "Notes are too long.", code: "validation" };
  return withUser(async ({ supabase }) => {
    const { error } = await supabase.from("applications").update({ notes: notes.trim() || null }).eq("id", appId);
    if (error) return { ok: false, error: "Could not save the notes." };
    return { ok: true, data: undefined };
  });
}

export async function setApplicationArchived(appId: string, archived: boolean): Promise<ActionResult> {
  if (!id.safeParse(appId).success) return notFound;
  return withUser(async ({ supabase }) => {
    const { error } = await supabase.from("applications").update({ archived_at: archived ? new Date().toISOString() : null }).eq("id", appId);
    if (error) return { ok: false, error: "Could not update the application." };
    revalidateApp(appId);
    return { ok: true, data: undefined };
  });
}

export async function setApplicationSubmitted(appId: string, submitted: boolean): Promise<ActionResult> {
  if (!id.safeParse(appId).success) return notFound;
  return withUser(async ({ supabase }) => {
    const { error } = await supabase.from("applications").update({ submitted_at: submitted ? new Date().toISOString() : null }).eq("id", appId);
    if (error) return { ok: false, error: "Could not update the application." };
    revalidateApp(appId);
    return { ok: true, data: undefined };
  });
}

export async function deleteApplication(appId: string): Promise<ActionResult> {
  if (!id.safeParse(appId).success) return notFound;
  return withUser(async ({ supabase }) => {
    // Essays, versions, reviews and links cascade. Documents and exemplars are library items and are kept.
    const { error } = await supabase.from("applications").delete().eq("id", appId);
    if (error) return { ok: false, error: "Could not delete the application." };
    revalidatePath("/");
    revalidatePath("/applications");
    return { ok: true, data: undefined };
  });
}

/**
 * Copies the application's structure — details, essay prompts and limits, checklist, exemplar
 * links — without drafts, versions or copies of private documents.
 */
export async function duplicateApplication(appId: string): Promise<ActionResult<{ id: string }>> {
  if (!id.safeParse(appId).success) return notFound;
  return withUser(async ({ supabase }) => {
    const { data: app } = await supabase.from("applications").select("*").eq("id", appId).maybeSingle<Application>();
    if (!app) return notFound;
    const { data: copy, error } = await supabase
      .from("applications")
      .insert({
        name: `${app.name} (copy)`.slice(0, 300),
        institution: app.institution,
        programme: app.programme,
        category: app.category,
        country: app.country,
        official_url: app.official_url,
        deadline: app.deadline,
        course_description: app.course_description,
        reason_for_applying: app.reason_for_applying,
        selection_criteria: app.selection_criteria,
        official_instructions: app.official_instructions,
        writing_preferences: app.writing_preferences,
        setup_step: app.setup_step,
        setup_completed_at: app.setup_completed_at,
        duplicated_from: app.id,
      })
      .select("id")
      .single<{ id: string }>();
    if (error || !copy) return { ok: false, error: "Could not duplicate the application." };

    const [{ data: essays }, { data: reqs }, { data: links }] = await Promise.all([
      supabase.from("essays").select("*").eq("application_id", appId).is("archived_at", null).returns<Essay[]>(),
      supabase.from("application_requirements").select("kind, title, details, due_date, position").eq("application_id", appId),
      supabase.from("exemplar_application_links").select("exemplar_id").eq("application_id", appId),
    ]);
    if (essays?.length) {
      await supabase.from("essays").insert(
        essays.map((e) => ({
          application_id: copy.id,
          title: e.title,
          essay_type: e.essay_type,
          prompt: e.prompt,
          min_words: e.min_words,
          max_words: e.max_words,
          required_themes: e.required_themes,
          selection_criteria: e.selection_criteria,
          required_format: e.required_format,
          instructions: e.instructions,
          restrictions: e.restrictions,
          position: e.position,
        })),
      );
    }
    if (reqs?.length) await supabase.from("application_requirements").insert(reqs.map((r) => ({ ...r, application_id: copy.id })));
    if (links?.length) await supabase.from("exemplar_application_links").insert(links.map((l) => ({ exemplar_id: l.exemplar_id, application_id: copy.id })));
    revalidatePath("/applications");
    return { ok: true, data: { id: copy.id } };
  });
}

// ---------------------------------------------------------------------------
// Essays (requirements, status)
// ---------------------------------------------------------------------------

function essayRow(v: z.output<typeof essayRequirementSchema>) {
  return {
    title: v.title,
    essay_type: v.essay_type,
    prompt: v.prompt,
    min_words: v.min_words,
    max_words: v.max_words,
    required_themes: v.required_themes,
    selection_criteria: v.selection_criteria || null,
    required_format: v.required_format || null,
    instructions: v.instructions || null,
    restrictions: v.restrictions || null,
  };
}

export async function addEssay(appId: string, input: EssayRequirementInput): Promise<ActionResult<{ id: string }>> {
  const parsed = essayRequirementSchema.safeParse(input);
  if (!id.safeParse(appId).success) return notFound;
  if (!parsed.success) return invalid(parsed.error);
  return withUser(async ({ supabase }) => {
    const { count } = await supabase.from("essays").select("id", { count: "exact", head: true }).eq("application_id", appId);
    const { data, error } = await supabase
      .from("essays")
      .insert({ ...essayRow(parsed.data), application_id: appId, position: count ?? 0 })
      .select("id")
      .single<{ id: string }>();
    if (error || !data) return { ok: false, error: "Could not add the essay." };
    revalidateApp(appId);
    return { ok: true, data: { id: data.id } };
  });
}

export async function updateEssayRequirements(essayId: string, input: EssayRequirementInput): Promise<ActionResult> {
  const parsed = essayRequirementSchema.safeParse(input);
  if (!id.safeParse(essayId).success) return notFound;
  if (!parsed.success) return invalid(parsed.error);
  return withUser(async ({ supabase }) => {
    const { data, error } = await supabase.from("essays").update(essayRow(parsed.data)).eq("id", essayId).select("application_id").maybeSingle<{ application_id: string }>();
    if (error || !data) return { ok: false, error: "Could not save the essay requirements." };
    revalidateApp(data.application_id);
    revalidatePath(`/studio/${essayId}`);
    return { ok: true, data: undefined };
  });
}

export async function setEssayStatus(essayId: string, status: EssayStatus): Promise<ActionResult> {
  if (!id.safeParse(essayId).success) return notFound;
  if (!essayStatusSchema.safeParse(status).success) return { ok: false, error: "Invalid status", code: "validation" };
  return withUser(async ({ supabase }) => {
    const { data, error } = await supabase.from("essays").update({ status }).eq("id", essayId).select("application_id").maybeSingle<{ application_id: string }>();
    if (error || !data) return { ok: false, error: "Could not update the status." };
    revalidateApp(data.application_id);
    revalidatePath(`/studio/${essayId}`);
    return { ok: true, data: undefined };
  });
}

export async function setEssayArchived(essayId: string, archived: boolean): Promise<ActionResult> {
  if (!id.safeParse(essayId).success) return notFound;
  return withUser(async ({ supabase }) => {
    const { data, error } = await supabase
      .from("essays")
      .update({ archived_at: archived ? new Date().toISOString() : null })
      .eq("id", essayId)
      .select("application_id")
      .maybeSingle<{ application_id: string }>();
    if (error || !data) return { ok: false, error: "Could not update the essay." };
    revalidateApp(data.application_id);
    return { ok: true, data: undefined };
  });
}

export async function deleteEssay(essayId: string): Promise<ActionResult> {
  if (!id.safeParse(essayId).success) return notFound;
  return withUser(async ({ supabase }) => {
    const { data } = await supabase.from("essays").select("application_id").eq("id", essayId).maybeSingle<{ application_id: string }>();
    const { error } = await supabase.from("essays").delete().eq("id", essayId);
    if (error || !data) return { ok: false, error: "Could not delete the essay." };
    revalidateApp(data.application_id);
    return { ok: true, data: undefined };
  });
}

// ---------------------------------------------------------------------------
// Checklist requirements and milestones
// ---------------------------------------------------------------------------

export async function addRequirementItem(appId: string, input: RequirementItemInput): Promise<ActionResult<{ id: string }>> {
  const parsed = requirementItemSchema.safeParse(input);
  if (!id.safeParse(appId).success) return notFound;
  if (!parsed.success) return invalid(parsed.error);
  return withUser(async ({ supabase }) => {
    const { count } = await supabase.from("application_requirements").select("id", { count: "exact", head: true }).eq("application_id", appId);
    const { data, error } = await supabase
      .from("application_requirements")
      .insert({ ...nullify(parsed.data), kind: parsed.data.kind, title: parsed.data.title, application_id: appId, position: count ?? 0 })
      .select("id")
      .single<{ id: string }>();
    if (error || !data) return { ok: false, error: "Could not add the item." };
    revalidateApp(appId);
    return { ok: true, data: { id: data.id } };
  });
}

export async function toggleRequirementItem(itemId: string, done: boolean): Promise<ActionResult> {
  if (!id.safeParse(itemId).success) return notFound;
  return withUser(async ({ supabase }) => {
    const { data, error } = await supabase
      .from("application_requirements")
      .update({ completed_at: done ? new Date().toISOString() : null })
      .eq("id", itemId)
      .select("application_id")
      .maybeSingle<{ application_id: string }>();
    if (error || !data) return { ok: false, error: "Could not update the item." };
    revalidateApp(data.application_id);
    return { ok: true, data: undefined };
  });
}

export async function deleteRequirementItem(itemId: string): Promise<ActionResult> {
  if (!id.safeParse(itemId).success) return notFound;
  return withUser(async ({ supabase }) => {
    const { data } = await supabase.from("application_requirements").select("application_id").eq("id", itemId).maybeSingle<{ application_id: string }>();
    const { error } = await supabase.from("application_requirements").delete().eq("id", itemId);
    if (error || !data) return { ok: false, error: "Could not delete the item." };
    revalidateApp(data.application_id);
    return { ok: true, data: undefined };
  });
}
