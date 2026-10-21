"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { withUser } from "@/lib/auth";
import { countWords, docToPlainText, docParagraphs, sanitizeDoc, type EssayDoc } from "@/lib/essay/doc";
import { runChecks } from "@/lib/essay/checks";
import { outlineValidator, type GapQuestion, type Outline } from "@/lib/ai/schemas";
import type { ServerSupabase } from "@/lib/supabase/server";
import type { ActionResult, Essay, EssayReview, EssayVersion, SourceRefs, VersionSource } from "@/lib/domain/types";
import { evidenceCorpus, loadEssayBundle } from "./internal/essay-data";

const id = z.string().uuid();
const notFound: ActionResult<never> = { ok: false, error: "Not found", code: "not_found" };
const MAX_DOC_BYTES = 400_000;

type Prepared = { doc: EssayDoc; plain: string; words: number };

function prepare(content: unknown): Prepared | null {
  const doc = sanitizeDoc(content);
  if (!doc || JSON.stringify(doc).length > MAX_DOC_BYTES) return null;
  const plain = docToPlainText(doc);
  return { doc, plain, words: countWords(plain) };
}

async function addVersion(
  supabase: ServerSupabase,
  essayId: string,
  v: Prepared,
  source: VersionSource,
  title: string,
  extra: { summary?: string | null; jobId?: string | null; refs?: SourceRefs } = {},
): Promise<string> {
  const { data, error } = await supabase
    .from("essay_versions")
    .insert({
      essay_id: essayId,
      content: v.doc,
      plain_text: v.plain,
      word_count: v.words,
      source,
      title: title.trim().slice(0, 200) || "Draft",
      change_summary: extra.summary?.slice(0, 2000) ?? null,
      ai_job_id: extra.jobId ?? null,
      evidence_refs: extra.refs ?? {},
    })
    .select("id")
    .single<{ id: string }>();
  if (error || !data) throw new Error("Could not create a version.");
  return data.id;
}

/** Writes the essay only if nobody else has saved since `expectedRevision` (stale tabs never overwrite newer text). */
async function writeEssay(
  supabase: ServerSupabase,
  essayId: string,
  expectedRevision: number,
  v: Prepared,
  autosave: boolean,
): Promise<ActionResult<{ revision: number; savedAt: string }>> {
  const savedAt = new Date().toISOString();
  const { data, error } = await supabase
    .from("essays")
    .update({
      content: v.doc,
      plain_text: v.plain,
      word_count: v.words,
      revision: expectedRevision + 1,
      ...(autosave ? { last_autosaved_at: savedAt } : {}),
    })
    .eq("id", essayId)
    .eq("revision", expectedRevision)
    .select("revision, status");
  if (error) return { ok: false, error: "Could not save the essay." };
  if (!data || data.length === 0) {
    return { ok: false, error: "This essay was changed in another window. Reload to see the latest version.", code: "conflict" };
  }
  // The first real text moves an essay from Not Started to In Progress.
  if ((data[0] as { status: string }).status === "not_started" && v.words > 0) {
    await supabase.from("essays").update({ status: "in_progress" }).eq("id", essayId);
  }
  return { ok: true, data: { revision: expectedRevision + 1, savedAt } };
}

export type SaveMode =
  | { kind: "autosave" }
  | { kind: "manual"; title?: string; summary?: string }
  | { kind: "ai_revision"; title: string; summary: string; jobId: string };

export async function saveEssay(
  essayId: string,
  content: unknown,
  expectedRevision: number,
  mode: SaveMode,
): Promise<ActionResult<{ revision: number; savedAt: string; versionId: string | null }>> {
  if (!id.safeParse(essayId).success) return notFound;
  if (!Number.isInteger(expectedRevision) || expectedRevision < 1) return { ok: false, error: "Invalid revision", code: "validation" };
  const v = prepare(content);
  if (!v) return { ok: false, error: "The essay content is invalid or too large.", code: "validation" };
  return withUser(async ({ supabase }) => {
    const res = await writeEssay(supabase, essayId, expectedRevision, v, mode.kind === "autosave");
    if (!res.ok) return res;
    let versionId: string | null = null;
    if (mode.kind === "manual") {
      versionId = await addVersion(supabase, essayId, v, "manual", mode.title || "Saved draft", { summary: mode.summary });
    } else if (mode.kind === "ai_revision") {
      if (!id.safeParse(mode.jobId).success) return { ok: false, error: "Invalid AI job", code: "validation" };
      const { data: job } = await supabase.from("ai_generation_jobs").select("source_refs").eq("id", mode.jobId).maybeSingle<{ source_refs: SourceRefs }>();
      versionId = await addVersion(supabase, essayId, v, "ai_revision", mode.title, { summary: mode.summary, jobId: mode.jobId, refs: job?.source_refs });
    }
    if (versionId) revalidatePath(`/studio/${essayId}`);
    return { ok: true, data: { ...res.data, versionId } };
  });
}

export async function restoreVersion(essayId: string, versionId: string, expectedRevision: number): Promise<ActionResult<{ revision: number; content: EssayDoc }>> {
  if (!id.safeParse(essayId).success || !id.safeParse(versionId).success) return notFound;
  return withUser(async ({ supabase }) => {
    const [{ data: essay }, { data: version }] = await Promise.all([
      supabase.from("essays").select("content, revision").eq("id", essayId).maybeSingle<Pick<Essay, "content" | "revision">>(),
      supabase.from("essay_versions").select("*").eq("id", versionId).eq("essay_id", essayId).maybeSingle<EssayVersion>(),
    ]);
    if (!essay || !version) return { ok: false, error: "Version not found.", code: "not_found" };
    if (essay.revision !== expectedRevision) return { ok: false, error: "This essay was changed in another window. Reload before restoring.", code: "conflict" };
    const current = prepare(essay.content);
    const target = prepare(version.content);
    if (!current || !target) return { ok: false, error: "The version could not be read." };
    // Keep the current text first, so a restore can always be undone.
    await addVersion(supabase, essayId, current, "pre_restore", `Before restoring “${version.title}”`);
    const res = await writeEssay(supabase, essayId, expectedRevision, target, false);
    if (!res.ok) return res;
    await addVersion(supabase, essayId, target, "restore", `Restored “${version.title}” (v${version.version_number})`);
    revalidatePath(`/studio/${essayId}`);
    return { ok: true, data: { revision: res.data.revision, content: target.doc } };
  });
}

/** The document an AI job produced (a full draft or a whole-essay revision), validated again on read. */
async function jobDocument(supabase: ServerSupabase, essayId: string, jobId: string) {
  const { data: job } = await supabase
    .from("ai_generation_jobs")
    .select("id, kind, status, essay_id, output, source_refs, action")
    .eq("id", jobId)
    .maybeSingle<{ id: string; kind: string; status: string; essay_id: string | null; output: { doc?: unknown; summary?: string } | null; source_refs: SourceRefs; action: string | null }>();
  if (!job || job.essay_id !== essayId || job.status !== "succeeded" || !["draft", "rewrite"].includes(job.kind)) return null;
  const doc = prepare(job.output?.doc);
  if (!doc) return null;
  return { job, doc };
}

/**
 * Applies an AI-generated draft or whole-essay revision the user previewed. The current text is
 * kept as a version first, so nothing is silently replaced.
 */
export async function applyAiDocument(essayId: string, jobId: string, expectedRevision: number): Promise<ActionResult<{ revision: number; content: EssayDoc }>> {
  if (!id.safeParse(essayId).success || !id.safeParse(jobId).success) return notFound;
  return withUser(async ({ supabase }) => {
    const found = await jobDocument(supabase, essayId, jobId);
    if (!found) return { ok: false, error: "That AI result is no longer available.", code: "not_found" };
    const { data: essay } = await supabase.from("essays").select("content, revision").eq("id", essayId).maybeSingle<Pick<Essay, "content" | "revision">>();
    if (!essay) return notFound;
    if (essay.revision !== expectedRevision) return { ok: false, error: "This essay was changed in another window. Reload first.", code: "conflict" };
    const current = prepare(essay.content);
    if (current && current.words > 0) await addVersion(supabase, essayId, current, "pre_ai", "Before applying AI result");
    const res = await writeEssay(supabase, essayId, expectedRevision, found.doc, false);
    if (!res.ok) return res;
    const isDraft = found.job.kind === "draft";
    await addVersion(supabase, essayId, found.doc, isDraft ? "ai_draft" : "ai_revision", isDraft ? "AI draft" : "AI revision", {
      jobId,
      refs: found.job.source_refs,
      summary: found.job.output?.summary ?? null,
    });
    revalidatePath(`/studio/${essayId}`);
    return { ok: true, data: { revision: res.data.revision, content: found.doc.doc } };
  });
}

/** Saves an AI result as a separate version without touching the current draft. */
export async function saveAiDocumentAsVersion(essayId: string, jobId: string): Promise<ActionResult<{ versionId: string }>> {
  if (!id.safeParse(essayId).success || !id.safeParse(jobId).success) return notFound;
  return withUser(async ({ supabase }) => {
    const found = await jobDocument(supabase, essayId, jobId);
    if (!found) return { ok: false, error: "That AI result is no longer available.", code: "not_found" };
    const isDraft = found.job.kind === "draft";
    const versionId = await addVersion(supabase, essayId, found.doc, isDraft ? "ai_draft" : "ai_revision", isDraft ? "AI draft (not applied)" : "AI revision (not applied)", {
      jobId,
      refs: found.job.source_refs,
      summary: found.job.output?.summary ?? null,
    });
    revalidatePath(`/studio/${essayId}`);
    return { ok: true, data: { versionId } };
  });
}

/** Stores content as a new version without changing the current draft (e.g. an AI edit kept as an alternative). */
export async function saveContentAsVersion(
  essayId: string,
  content: unknown,
  title: string,
  summary: string | null,
  jobId: string | null,
): Promise<ActionResult<{ versionId: string }>> {
  if (!id.safeParse(essayId).success) return notFound;
  if (jobId && !id.safeParse(jobId).success) return { ok: false, error: "Invalid AI job", code: "validation" };
  const v = prepare(content);
  if (!v) return { ok: false, error: "The content is invalid or too large.", code: "validation" };
  return withUser(async ({ supabase }) => {
    const { data: essay } = await supabase.from("essays").select("id").eq("id", essayId).maybeSingle();
    if (!essay) return notFound;
    let refs: SourceRefs | undefined;
    if (jobId) {
      const { data: job } = await supabase.from("ai_generation_jobs").select("source_refs").eq("id", jobId).maybeSingle<{ source_refs: SourceRefs }>();
      refs = job?.source_refs;
    }
    const versionId = await addVersion(supabase, essayId, v, jobId ? "ai_revision" : "duplicate", title || "Alternative draft", { summary, jobId, refs });
    revalidatePath(`/studio/${essayId}`);
    return { ok: true, data: { versionId } };
  });
}

export async function getVersion(essayId: string, versionId: string): Promise<ActionResult<EssayVersion>> {
  if (!id.safeParse(essayId).success || !id.safeParse(versionId).success) return notFound;
  return withUser(async ({ supabase }) => {
    const { data } = await supabase.from("essay_versions").select("*").eq("id", versionId).eq("essay_id", essayId).maybeSingle<EssayVersion>();
    if (!data) return { ok: false, error: "Version not found.", code: "not_found" };
    return { ok: true, data };
  });
}

export async function renameVersion(versionId: string, title: string): Promise<ActionResult> {
  const t = title.trim();
  if (!id.safeParse(versionId).success) return notFound;
  if (!t || t.length > 200) return { ok: false, error: "Enter a name of up to 200 characters.", code: "validation" };
  return withUser(async ({ supabase }) => {
    const { data, error } = await supabase.from("essay_versions").update({ title: t }).eq("id", versionId).select("essay_id").maybeSingle<{ essay_id: string }>();
    if (error || !data) return { ok: false, error: "Could not rename the draft." };
    revalidatePath(`/studio/${data.essay_id}`);
    return { ok: true, data: undefined };
  });
}

export async function setVersionArchived(versionId: string, archived: boolean): Promise<ActionResult> {
  if (!id.safeParse(versionId).success) return notFound;
  return withUser(async ({ supabase }) => {
    const { data, error } = await supabase
      .from("essay_versions")
      .update({ archived_at: archived ? new Date().toISOString() : null })
      .eq("id", versionId)
      .select("essay_id")
      .maybeSingle<{ essay_id: string }>();
    if (error || !data) return { ok: false, error: "Could not update the draft." };
    revalidatePath(`/studio/${data.essay_id}`);
    return { ok: true, data: undefined };
  });
}

/** Copies a saved draft as a new version (e.g. to branch an alternative). */
export async function duplicateVersion(essayId: string, versionId: string): Promise<ActionResult<{ versionId: string }>> {
  if (!id.safeParse(essayId).success || !id.safeParse(versionId).success) return notFound;
  return withUser(async ({ supabase }) => {
    const { data: v } = await supabase.from("essay_versions").select("*").eq("id", versionId).eq("essay_id", essayId).maybeSingle<EssayVersion>();
    const p = v ? prepare(v.content) : null;
    if (!v || !p) return { ok: false, error: "Version not found.", code: "not_found" };
    const newId = await addVersion(supabase, essayId, p, "duplicate", `${v.title} (copy)`, { refs: v.evidence_refs });
    revalidatePath(`/studio/${essayId}`);
    return { ok: true, data: { versionId: newId } };
  });
}

// ---------------------------------------------------------------------------
// Evidence links, gap answers and outline
// ---------------------------------------------------------------------------

const linkTarget = z.object({ type: z.enum(["entry", "document"]), id: z.string().uuid() });

/**
 * Links a library entry or document to an essay. For an "Ask first" entry, linking is the
 * user's approval to use it in this essay. Private entries can be linked but are never sent to the AI.
 */
export async function setEssayEvidenceLink(essayId: string, target: z.input<typeof linkTarget>, linked: boolean): Promise<ActionResult> {
  const t = linkTarget.safeParse(target);
  if (!id.safeParse(essayId).success || !t.success) return notFound;
  const column = t.data.type === "entry" ? "entry_id" : "document_id";
  return withUser(async ({ supabase }) => {
    if (linked) {
      const { count } = await supabase.from("essay_evidence_links").select("id", { count: "exact", head: true }).eq("essay_id", essayId);
      const { error } = await supabase.from("essay_evidence_links").insert({ essay_id: essayId, [column]: t.data.id, position: count ?? 0 });
      if (error && error.code !== "23505") return { ok: false, error: "Could not link the item." };
    } else {
      const { error } = await supabase.from("essay_evidence_links").delete().eq("essay_id", essayId).eq(column, t.data.id);
      if (error) return { ok: false, error: "Could not unlink the item." };
    }
    revalidatePath(`/studio/${essayId}`);
    if (t.data.type === "entry") revalidatePath(`/library/entry/${t.data.id}`);
    return { ok: true, data: undefined };
  });
}

const answers = z.array(z.object({ id: z.string().max(100), answer: z.string().max(4000) })).max(30);

export async function saveGapAnswers(essayId: string, input: { id: string; answer: string }[]): Promise<ActionResult> {
  const parsed = answers.safeParse(input);
  if (!id.safeParse(essayId).success || !parsed.success) return notFound;
  return withUser(async ({ supabase }) => {
    const { data: essay } = await supabase.from("essays").select("gap_questions").eq("id", essayId).maybeSingle<{ gap_questions: GapQuestion[] }>();
    if (!essay) return notFound;
    const byId = new Map(parsed.data.map((a) => [a.id, a.answer.trim()]));
    const updated = (essay.gap_questions ?? []).map((q) => (byId.has(q.id) ? { ...q, answer: byId.get(q.id)! } : q));
    const { error } = await supabase.from("essays").update({ gap_questions: updated }).eq("id", essayId);
    if (error) return { ok: false, error: "Could not save your answers." };
    return { ok: true, data: undefined };
  });
}

/** Saves an edited outline. Approving it unlocks draft generation. */
export async function saveOutline(essayId: string, outline: Outline, approve: boolean): Promise<ActionResult> {
  const parsed = outlineValidator.safeParse(outline);
  if (!id.safeParse(essayId).success) return notFound;
  if (!parsed.success) return { ok: false, error: "The outline needs a thesis and at least one section.", code: "validation" };
  if (JSON.stringify(parsed.data).length > 60000) return { ok: false, error: "The outline is too long.", code: "validation" };
  return withUser(async ({ supabase }) => {
    const { error } = await supabase
      .from("essays")
      .update({ outline: parsed.data, outline_status: approve ? "approved" : "draft", outline_approved_at: approve ? new Date().toISOString() : null })
      .eq("id", essayId);
    if (error) return { ok: false, error: "Could not save the outline." };
    revalidatePath(`/studio/${essayId}`);
    return { ok: true, data: undefined };
  });
}

// ---------------------------------------------------------------------------
// Review
// ---------------------------------------------------------------------------

/** Runs the deterministic checks on the saved draft and stores them, carrying over dismissals. */
export async function runEssayChecks(essayId: string): Promise<ActionResult<EssayReview>> {
  if (!id.safeParse(essayId).success) return notFound;
  return withUser(async ({ supabase }) => {
    const bundle = await loadEssayBundle(supabase, essayId);
    if (!bundle) return notFound;
    const { essay, application } = bundle;
    const result = runChecks({
      prompt: essay.prompt,
      minWords: essay.min_words,
      maxWords: essay.max_words,
      requiredThemes: essay.required_themes,
      criteria: [essay.selection_criteria, application.selection_criteria].filter(Boolean).join("\n"),
      paragraphs: docParagraphs(essay.content),
      evidenceText: evidenceCorpus(bundle),
      exemplars: bundle.attachedExemplars.map((e) => ({ title: e.title, text: e.source_text })),
    });
    const { data: previous } = await supabase
      .from("essay_reviews")
      .select("dismissed_ids")
      .eq("essay_id", essayId)
      .eq("kind", "checks")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<{ dismissed_ids: string[] }>();
    const ids = new Set(result.findings.map((f) => f.id));
    const { data, error } = await supabase
      .from("essay_reviews")
      .insert({
        essay_id: essayId,
        kind: "checks",
        essay_revision: essay.revision,
        word_count: essay.word_count,
        findings: result.findings,
        summary: result.summary,
        dismissed_ids: (previous?.dismissed_ids ?? []).filter((d) => ids.has(d)),
      })
      .select("*")
      .single<EssayReview>();
    if (error || !data) return { ok: false, error: "Could not save the review." };
    return { ok: true, data };
  });
}

export async function setFindingDismissed(reviewId: string, findingId: string, dismissed: boolean): Promise<ActionResult<{ dismissed_ids: string[] }>> {
  if (!id.safeParse(reviewId).success || !findingId || findingId.length > 120) return notFound;
  return withUser(async ({ supabase }) => {
    const { data: review } = await supabase.from("essay_reviews").select("dismissed_ids").eq("id", reviewId).maybeSingle<{ dismissed_ids: string[] }>();
    if (!review) return notFound;
    const set = new Set(review.dismissed_ids);
    if (dismissed) set.add(findingId);
    else set.delete(findingId);
    const next = [...set];
    const { error } = await supabase.from("essay_reviews").update({ dismissed_ids: next }).eq("id", reviewId);
    if (error) return { ok: false, error: "Could not update the finding." };
    return { ok: true, data: { dismissed_ids: next } };
  });
}
