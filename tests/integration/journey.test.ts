// End-to-end journey through the real server actions and route handlers, against an in-memory
// Supabase fake and deterministic AI fixtures (AI_MOCK_RESPONSES=1). No network or paid API calls.

import { beforeAll, describe, expect, it, vi } from "vitest";
import JSZip from "jszip";
import { Document, Packer, Paragraph, TextRun } from "docx";
import { FakeDb, fakeClient } from "../support/fake-supabase";

const h = vi.hoisted(() => ({ db: null as unknown as FakeDb, pending: [] as Promise<unknown>[] }));

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => fakeClient(h.db) }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
}));
vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return { ...actual, after: (fn: () => Promise<unknown>) => void h.pending.push(fn()) };
});

import { addEssay, addRequirementItem, createApplication, duplicateApplication, setSetupStep, updateWritingPreferences } from "@/server/applications";
import { prepareUpload, registerDocument } from "@/server/documents";
import { createExemplarFromText, deleteExemplar, setExemplarLink, setLessonSelected, setEssayExemplarSettings } from "@/server/exemplars";
import { saveStory } from "@/server/library";
import {
  applyAiDocument,
  getVersion,
  restoreVersion,
  runEssayChecks,
  saveEssay,
  saveOutline,
  setEssayEvidenceLink,
  setFindingDismissed,
  saveGapAnswers,
} from "@/server/essays";
import { setAiEnabled } from "@/server/account";
import { importLetterStudioEvidence, listLetterStudioEvidence } from "@/server/letter-studio-import";
import { POST as essayAi } from "@/app/api/essays/[id]/ai/route";
import { GET as analysisStatus, POST as analyse } from "@/app/api/exemplars/[id]/analyse/route";
import { GET as exportEssays } from "@/app/api/export/route";
import { docFromParagraphs, docToPlainText, type EssayDoc } from "@/lib/essay/doc";
import type { ActionResult, Essay, EssayVersion } from "@/lib/domain/types";
import type { Outline } from "@/lib/ai/schemas";

const USER_A = "00000000-0000-4000-8000-00000000000a";
const USER_B = "00000000-0000-4000-8000-00000000000b";

function ok<T>(r: ActionResult<T>): T {
  if (!r.ok) throw new Error(`Action failed: ${r.error}`);
  return r.data;
}

const params = (id: string) => ({ params: Promise.resolve({ id }) });
const post = (url: string, body: unknown) => new Request(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const key = () => crypto.randomUUID();
const essayRow = (id: string) => h.db.rows("essays").find((e) => e.id === id) as unknown as Essay;

const EXEMPLAR_TEXT = Array.from({ length: 6 }, (_, i) => `Paragraph ${i + 1}: when the river flooded our village I learned that leadership begins with listening to the people most affected by a decision.`).join("\n\n");

describe("complete application journey", () => {
  let appId: string;
  let essayId: string;
  let exemplarId: string;
  let storyId: string;

  beforeAll(() => {
    process.env.AI_MOCK_RESPONSES = "1";
    h.db = new FakeDb();
    h.db.rows("profiles").push({ id: USER_A, writing_preferences: { tone: "reflective" }, export_settings: {}, ai_enabled: true });
    h.db.rows("profiles").push({ id: USER_B, writing_preferences: {}, export_settings: {}, ai_enabled: true });
  });

  it("requires authentication", async () => {
    h.db.userId = null;
    const res = await createApplication({ institution: "X", programme: "Y", name: "", category: "scholarship", country: "", official_url: "", deadline: "", course_description: "", reason_for_applying: "" });
    expect(res).toMatchObject({ ok: false, code: "unauthenticated" });
    const ai = await essayAi(post("http://t/api", { op: "analyse_prompt", idempotencyKey: key() }), params(crypto.randomUUID()));
    expect(ai.status).toBe(401);
  });

  it("creates an application through the setup wizard and saves progress", async () => {
    h.db.userId = USER_A;
    appId = ok(
      await createApplication({
        institution: "FCDO",
        programme: "Chevening Scholarship",
        name: "",
        category: "scholarship",
        country: "United Kingdom",
        official_url: "https://www.chevening.org",
        deadline: "2026-11-05",
        course_description: "One-year master's for future leaders.",
        reason_for_applying: "Digital inclusion policy",
      }),
    ).id;
    const app = h.db.rows("applications").find((a) => a.id === appId)!;
    expect(app).toMatchObject({ name: "Chevening Scholarship — FCDO", setup_step: 2, writing_preferences: { tone: "reflective" } });

    essayId = ok(
      await addEssay(appId, {
        title: "Leadership and influencing",
        essay_type: "leadership_essay",
        prompt: "  Describe how you have demonstrated leadership and influencing skills.  ",
        min_words: "",
        max_words: "500",
        required_themes: ["leadership"],
        selection_criteria: "",
        required_format: "",
        instructions: "",
        restrictions: "",
      }),
    ).id;
    expect(essayRow(essayId)).toMatchObject({ prompt: "Describe how you have demonstrated leadership and influencing skills.", max_words: 500, min_words: null, status: "not_started" });
    expect((await addEssay(appId, { title: "Bad", essay_type: "custom", prompt: "", min_words: "600", max_words: "500", required_themes: [], selection_criteria: "", required_format: "", instructions: "", restrictions: "" })).ok).toBe(false);

    ok(await addRequirementItem(appId, { kind: "requirement", title: "Two references", details: "", due_date: "" }));
    ok(await setSetupStep(appId, 3));
    ok(await setSetupStep(appId, 2));
    expect(h.db.rows("applications").find((a) => a.id === appId)!.setup_step).toBe(3);
    ok(await updateWritingPreferences(appId, { tone: "confident", spelling: "british", themes: ["digital inclusion"] }));
    ok(await setSetupStep(appId, 4, true));
    expect(h.db.rows("applications").find((a) => a.id === appId)!.setup_completed_at).toBeTruthy();
  });

  it("uploads a supporting document and extracts its text", async () => {
    const doc = new Document({ sections: [{ children: [new Paragraph({ children: [new TextRun("Founded a coding club that grew to 60 members.")] })] }] });
    const bytes = new Uint8Array(await Packer.toBuffer(doc));
    const bad = await prepareUpload({ name: "cv.exe", size: 100, type: "application/octet-stream" }, "documents");
    expect(bad.ok).toBe(false);
    const { path } = ok(await prepareUpload({ name: "cv.docx", size: bytes.byteLength, type: "" }, "documents"));
    expect(path.startsWith(`${USER_A}/documents/`)).toBe(true);
    h.db.files.set(path, bytes);
    const res = ok(await registerDocument({ path, fileName: "cv.docx", title: "CV", doc_type: "cv", application_id: appId, notes: "" }));
    expect(res.status).toBe("extracted");
    expect(h.db.rows("supporting_documents")[0]).toMatchObject({ extracted_text: "Founded a coding club that grew to 60 members.", extraction_status: "extracted" });
    ok(await setEssayEvidenceLink(essayId, { type: "document", id: res.id }, true));
    // Another user's storage path is rejected.
    expect((await registerDocument({ path: `${USER_B}/documents/x.docx`, fileName: "x.docx", title: "X", doc_type: "cv", application_id: null, notes: "" })).ok).toBe(false);
  });

  it("records a story and links it to the essay", async () => {
    storyId = ok(
      await saveStory(null, {
        title: "Founded a community coding club",
        context: "Few girls in my town had computers.",
        challenge: "No venue",
        actions: "Negotiated library space and recruited mentors.",
        outcome: "Grew to 60 members.",
        measurable_impact: "60 members",
        lessons: "",
        motivation: "",
        skills: ["leadership"],
        related_criteria: [],
        supporting_evidence: "",
        tags: ["leadership"],
        period: "2022–2024",
        verification_status: "verified",
      }),
    ).id;
    ok(await setEssayEvidenceLink(essayId, { type: "story", id: storyId }, true));
    ok(await setEssayEvidenceLink(essayId, { type: "story", id: storyId }, true)); // idempotent
    expect(h.db.rows("essay_evidence_links").filter((l) => l.story_id === storyId)).toHaveLength(1);
  });

  it("uploads, analyses and caches an exemplar, and selects its lessons", async () => {
    const meta = { title: "Sample SoP", essay_category: "statement_of_purpose" as const, institution: "", programme: "", author_attribution: "", original_prompt: "", original_word_limit: "", application_year: "", source_url: "", provenance: "uploader_reported" as const, notes: "", tags: [] };
    expect((await createExemplarFromText({ text: EXEMPLAR_TEXT, meta, permissionConfirmed: false })).ok).toBe(false);
    exemplarId = ok(await createExemplarFromText({ text: EXEMPLAR_TEXT, meta, permissionConfirmed: true })).id;

    const started = await analyse(post("http://t", { idempotencyKey: key() }), params(exemplarId));
    expect(started.status).toBe(202);
    await Promise.all(h.pending.splice(0));
    const status = await (await analysisStatus(new Request("http://t"), params(exemplarId))).json();
    expect(status.analysis.status).toBe("complete");
    const analysis = h.db.rows("exemplar_analyses")[0];
    expect(analysis.report).toBeTruthy();
    expect(analysis.source_hash).toBe(h.db.rows("exemplars")[0].source_hash);

    // Same text + spec: the cached analysis is reused, no new AI job.
    const jobsBefore = h.db.rows("ai_generation_jobs").length;
    const again = await (await analyse(post("http://t", { idempotencyKey: key() }), params(exemplarId))).json();
    expect(again).toMatchObject({ cached: true, status: "complete" });
    expect(h.db.rows("ai_generation_jobs").length).toBe(jobsBefore);

    ok(await setExemplarLink(exemplarId, appId, true));
    ok(await setLessonSelected({ essayId, exemplarId, analysisId: analysis.id as string, aspect: "opening", lessonKey: "aspect:opening", content: "Open with a concrete moment." }, true));
    ok(await setEssayExemplarSettings(essayId, true, ["opening"]));
    expect(essayRow(essayId).use_exemplars).toBe(true);
  });

  it("runs the staged AI workflow: prompt analysis, gaps, outline, draft", async () => {
    const run = (body: Record<string, unknown>) => essayAi(post("http://t", { idempotencyKey: key(), ...body }), params(essayId));

    const analysed = await run({ op: "analyse_prompt" });
    expect(analysed.status).toBe(200);
    expect(essayRow(essayId).prompt_analysis).toMatchObject({ central_question: expect.any(String) });

    const gaps = await (await run({ op: "gap_questions" })).json();
    expect(gaps.questions).toHaveLength(1);
    ok(await saveGapAnswers(essayId, [{ id: gaps.questions[0].id, answer: "60 members" }]));
    expect(essayRow(essayId).gap_questions[0].answer).toBe("60 members");

    // No draft before an approved outline.
    expect((await run({ op: "draft" })).status).toBe(422);

    const outlineRes = await (await run({ op: "outline" })).json();
    expect(essayRow(essayId).outline_status).toBe("draft");
    // Outline evidence references are stored as readable labels, not per-request aliases.
    expect(outlineRes.outline.sections[0].evidence_refs).toEqual(["Story: Founded a community coding club"]);
    ok(await saveOutline(essayId, essayRow(essayId).outline as Outline, true));
    expect(essayRow(essayId).outline_status).toBe("approved");

    const draft = await (await run({ op: "draft", includeHeadings: false })).json();
    expect(draft.ok).toBe(true);
    expect(draft.wordCount).toBeGreaterThan(5);
    expect(draft.usedRefs.story_ids).toEqual([storyId]);
    // Generating does not touch the essay until the user applies it.
    expect(essayRow(essayId).word_count).toBe(0);

    const applied = ok(await applyAiDocument(essayId, draft.jobId, essayRow(essayId).revision));
    expect(docToPlainText(applied.content)).toContain("coding club");
    expect(essayRow(essayId).word_count).toBeGreaterThan(5);
    const versions = h.db.rows("essay_versions").filter((v) => v.essay_id === essayId);
    expect(versions.map((v) => v.source)).toEqual(["ai_draft"]);
    expect(versions[0].ai_job_id).toBe(draft.jobId);
  });

  it("replays duplicate requests instead of starting a second, billed job", async () => {
    const k = key();
    const first = await (await essayAi(post("http://t", { op: "analyse_prompt", idempotencyKey: k }), params(essayId))).json();
    const count = h.db.rows("ai_generation_jobs").length;
    const second = await (await essayAi(post("http://t", { op: "analyse_prompt", idempotencyKey: k }), params(essayId))).json();
    expect(second.replay).toBe(true);
    expect(second.jobId).toBe(first.jobId);
    expect(h.db.rows("ai_generation_jobs").length).toBe(count);
  });

  it("autosaves with optimistic concurrency and creates manual versions", async () => {
    const rev = essayRow(essayId).revision;
    const doc = docFromParagraphs(["I founded a coding club in 2022.", "It grew to 60 members and taught me to listen."]);
    const saved = ok(await saveEssay(essayId, doc, rev, { kind: "autosave" }));
    expect(saved.revision).toBe(rev + 1);
    expect(essayRow(essayId).status).toBe("in_progress");
    // A stale tab cannot overwrite newer text.
    const stale = await saveEssay(essayId, docFromParagraphs(["Old text"]), rev, { kind: "autosave" });
    expect(stale).toMatchObject({ ok: false, code: "conflict" });
    expect(essayRow(essayId).plain_text).toContain("60 members");
    // Unknown node types are stripped before saving.
    ok(await saveEssay(essayId, { type: "doc", content: [...doc.content, { type: "iframe" }] }, rev + 1, { kind: "manual", title: "Clean draft" }));
    expect((essayRow(essayId).content as EssayDoc).content).toHaveLength(2);
    expect(h.db.rows("essay_versions").some((v) => v.essay_id === essayId && v.title === "Clean draft" && v.source === "manual")).toBe(true);
  });

  it("proposes an AI revision and records the accepted change as a version", async () => {
    const res = await (
      await essayAi(post("http://t", { op: "edit", idempotencyKey: key(), action: "clarity", scope: "selection", target: "I founded a coding club in 2022.", essayText: essayRow(essayId).plain_text }), params(essayId))
    ).json();
    expect(res).toMatchObject({ mode: "revise", original: "I founded a coding club in 2022.", revised: "I founded a coding club in 2022. (revised)" });
    // Nothing changed until the user accepts.
    expect(essayRow(essayId).plain_text).not.toContain("(revised)");
    const accepted = docFromParagraphs([res.revised, "It grew to 60 members and taught me to listen."]);
    ok(await saveEssay(essayId, accepted, essayRow(essayId).revision, { kind: "ai_revision", title: "Improve Clarity", summary: res.summary, jobId: res.jobId }));
    const v = h.db.rows("essay_versions").find((x) => x.ai_job_id === res.jobId)!;
    expect(v).toMatchObject({ source: "ai_revision", title: "Improve Clarity" });

    const critique = await (await essayAi(post("http://t", { op: "edit", idempotencyKey: key(), action: "critique", scope: "selection", target: "It grew.", essayText: "It grew." }), params(essayId))).json();
    expect(critique.mode).toBe("critique");
  });

  it("reviews the draft against requirements and keeps dismissals across reruns", async () => {
    ok(await saveEssay(essayId, docFromParagraphs(["Since I was a child I wanted to lead. The club grew 45% and reached [ADD: number] schools."]), essayRow(essayId).revision, { kind: "autosave" }));
    const review = ok(await runEssayChecks(essayId));
    const categories = review.findings.map((f) => f.category);
    expect(categories).toEqual(expect.arrayContaining(["missing_requirements", "unsupported_claims", "specificity"]));
    const generic = review.findings.find((f) => f.category === "specificity")!;
    ok(await setFindingDismissed(review.id, generic.id, true));
    const rerun = ok(await runEssayChecks(essayId));
    expect(rerun.dismissed_ids).toEqual([generic.id]);

    const ai = await (await essayAi(post("http://t", { op: "review", idempotencyKey: key(), essayText: essayRow(essayId).plain_text }), params(essayId))).json();
    expect(ai.findings[0]).toMatchObject({ source: "ai", label: "needs_improvement" });
    expect(h.db.rows("essay_reviews").filter((r) => r.kind === "ai")).toHaveLength(1);
  });

  it("flags passages copied from an attached exemplar", async () => {
    ok(await saveEssay(essayId, docFromParagraphs(["For me, leadership begins with listening to the people most affected by a decision."]), essayRow(essayId).revision, { kind: "autosave" }));
    const review = ok(await runEssayChecks(essayId));
    expect(review.findings.find((f) => f.category === "authenticity")).toMatchObject({ severity: "critical" });
  });

  it("restores a previous version after backing up the current text", async () => {
    const manual = h.db.rows("essay_versions").find((v) => v.essay_id === essayId && v.title === "Clean draft") as unknown as EssayVersion;
    const before = essayRow(essayId).plain_text;
    const res = ok(await restoreVersion(essayId, manual.id, essayRow(essayId).revision));
    expect(docToPlainText(res.content)).toBe(manual.plain_text);
    expect(essayRow(essayId).plain_text).toBe(manual.plain_text);
    const sources = h.db.rows("essay_versions").filter((v) => v.essay_id === essayId).map((v) => v.source);
    expect(sources.slice(-2)).toEqual(["pre_restore", "restore"]);
    const backup = h.db.rows("essay_versions").filter((v) => v.source === "pre_restore").at(-1)!;
    expect(backup.plain_text).toBe(before);
  });

  it("exports the saved essay as DOCX, PDF and text containing only the essay", async () => {
    const url = (format: string, extra = "") => new Request(`http://t/api/export?essayIds=${essayId}&format=${format}${extra}`);
    const txt = await exportEssays(url("txt"));
    expect(txt.status).toBe(200);
    expect(await txt.text()).toBe(`${essayRow(essayId).plain_text}\n`);
    const docx = await exportEssays(url("docx", "&font=sans&fontSize=11"));
    expect(docx.headers.get("Content-Type")).toContain("wordprocessingml");
    const xml = await (await JSZip.loadAsync(await docx.arrayBuffer())).file("word/document.xml")!.async("string");
    expect(xml).toContain("I founded a coding club in 2022.");
    const pdf = await exportEssays(url("pdf", "&cover=1&coverTitle=Chevening"));
    expect(new TextDecoder().decode(new Uint8Array(await pdf.arrayBuffer()).slice(0, 5))).toBe("%PDF-");
    expect((await exportEssays(url("exe"))).status).toBe(422);
  });

  it("isolates users: another user cannot read, export or run AI on these records", async () => {
    h.db.userId = USER_B;
    const version = h.db.rows("essay_versions").find((v) => v.essay_id === essayId)!;
    expect((await getVersion(essayId, version.id as string)).ok).toBe(false);
    expect((await exportEssays(new Request(`http://t/api/export?essayIds=${essayId}&format=txt`))).status).toBe(404);
    expect((await essayAi(post("http://t", { op: "analyse_prompt", idempotencyKey: key() }), params(essayId))).status).toBe(404);
    expect((await analyse(post("http://t", { idempotencyKey: key() }), params(exemplarId))).status).toBe(404);
    expect((await saveEssay(essayId, docFromParagraphs(["hijack"]), 1, { kind: "autosave" })).ok).toBe(false);
    h.db.userId = USER_A;
    expect(essayRow(essayId).plain_text).not.toContain("hijack");
  });

  it("refuses AI operations when the user has switched AI off", async () => {
    ok(await setAiEnabled(false));
    const res = await essayAi(post("http://t", { op: "analyse_prompt", idempotencyKey: key() }), params(essayId));
    expect(res.status).toBe(403);
    ok(await setAiEnabled(true));
  });

  it("duplicates an application's structure without drafts or documents", async () => {
    const copyId = ok(await duplicateApplication(appId)).id;
    const copied = h.db.rows("essays").filter((e) => e.application_id === copyId);
    expect(copied).toHaveLength(1);
    expect(copied[0]).toMatchObject({ prompt: essayRow(essayId).prompt, word_count: 0, plain_text: "" });
    expect(h.db.rows("supporting_documents").filter((d) => d.application_id === copyId)).toHaveLength(0);
    expect(h.db.rows("exemplar_application_links").filter((l) => l.application_id === copyId)).toHaveLength(1);
  });

  it("imports the user's Recommendation Letter Studio evidence as Story Bank copies", async () => {
    const mine = { title: "Hospital dashboard", category: "leadership", description: null, period: "2024", role: "Lead", individual_contribution: "Built it", problem: null, decisions: null, outcome: "Adopted", quantified_impact: null, supporting_url: null, information_source: null, verification_status: "needs_verification" };
    h.db.rows("public.evidence").push({ id: "3e000000-0000-4000-8000-00000000000a", user_id: USER_A, created_at: "2026-01-01", ...mine });
    h.db.rows("public.evidence").push({ id: "3e000000-0000-4000-8000-00000000000b", user_id: USER_B, created_at: "2026-01-01", ...mine, title: "B's evidence" });

    const listed = ok(await listLetterStudioEvidence());
    expect(listed.items.map((i) => i.title)).toEqual(["Hospital dashboard"]);
    expect(listed.items[0]).toMatchObject({ alreadyImported: false, verification: "needs_confirmation" });

    // Another user's evidence ID is never imported.
    const res = ok(await importLetterStudioEvidence(["3e000000-0000-4000-8000-00000000000a", "3e000000-0000-4000-8000-00000000000b"]));
    expect(res).toEqual({ imported: 1, skipped: 1 });
    const story = h.db.rows("story_bank_items").find((s) => s.source_ref === "letter-studio:evidence:3e000000-0000-4000-8000-00000000000a")!;
    expect(story).toMatchObject({ title: "Hospital dashboard", verification_status: "needs_confirmation", outcome: "Adopted" });

    expect(ok(await importLetterStudioEvidence(["3e000000-0000-4000-8000-00000000000a"]))).toEqual({ imported: 0, skipped: 1 });
    expect(ok(await listLetterStudioEvidence()).items[0].alreadyImported).toBe(true);
    // The source data in Letter Studio is never modified.
    expect(h.db.rows("public.evidence")).toHaveLength(2);
  });

  it("deletes an exemplar with its cached analyses and selected lessons", async () => {
    ok(await deleteExemplar(exemplarId));
    expect(h.db.rows("exemplar_analyses")).toHaveLength(0);
    expect(h.db.rows("exemplar_selected_lessons")).toHaveLength(0);
  });
});
