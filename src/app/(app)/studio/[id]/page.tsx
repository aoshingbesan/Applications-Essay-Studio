import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { uuidParam } from "@/lib/api";
import { isAiConfigured } from "@/lib/ai/client";
import { EXEMPLAR_SPEC_VERSION } from "@/lib/ai/prompts/exemplars";
import type { EssayReview, EssayVersion, ExportSettings, Profile } from "@/lib/domain/types";
import { loadEssayBundle } from "@/server/internal/essay-data";
import { ESSAY_SUMMARY_COLUMNS, type EssaySummary } from "@/server/queries";
import { Workspace } from "./workspace";
import type { WorkspaceData } from "./types";

export const metadata: Metadata = { title: "Writing workspace" };

export default async function EssayWorkspacePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!uuidParam.safeParse(id).success) notFound();
  const { supabase } = await requireUser();
  const bundle = await loadEssayBundle(supabase, id);
  if (!bundle) notFound();
  const { essay, application } = bundle;

  const [{ data: siblings }, { data: versions }, { data: reviews }, { data: profile }, { data: exemplarLinks }] = await Promise.all([
    supabase.from("essays").select(ESSAY_SUMMARY_COLUMNS).eq("application_id", application.id).is("archived_at", null).order("position").returns<EssaySummary[]>(),
    supabase
      .from("essay_versions")
      .select("id, essay_id, version_number, title, word_count, source, change_summary, ai_job_id, evidence_refs, review_status, archived_at, created_at, updated_at")
      .eq("essay_id", id)
      .order("version_number", { ascending: false })
      .limit(100)
      .returns<Omit<EssayVersion, "content" | "plain_text">[]>(),
    supabase.from("essay_reviews").select("*").eq("essay_id", id).order("created_at", { ascending: false }).limit(10).returns<EssayReview[]>(),
    supabase.from("profiles").select("export_settings, full_name").maybeSingle<Pick<Profile, "export_settings" | "full_name">>(),
    supabase.from("exemplar_application_links").select("exemplars(id, title, source_hash, archived_at)").eq("application_id", application.id).returns<{ exemplars: { id: string; title: string; source_hash: string | null; archived_at: string | null } | null }[]>(),
  ]);

  // Which attached exemplars have a current analysis (so lessons can be chosen from them).
  const attached = (exemplarLinks ?? []).flatMap((l) => (l.exemplars && !l.exemplars.archived_at ? [l.exemplars] : []));
  const { data: analyses } = attached.length
    ? await supabase
        .from("exemplar_analyses")
        .select("exemplar_id, source_hash")
        .in("exemplar_id", attached.map((x) => x.id))
        .eq("status", "complete")
        .eq("spec_version", EXEMPLAR_SPEC_VERSION)
        .returns<{ exemplar_id: string; source_hash: string }[]>()
    : { data: [] as { exemplar_id: string; source_hash: string }[] };

  const data: WorkspaceData = {
    essay,
    application: {
      id: application.id,
      name: application.name,
      programme: application.programme,
      institution: application.institution,
      selection_criteria: application.selection_criteria,
      official_instructions: application.official_instructions,
    },
    siblings: siblings ?? [],
    versions: versions ?? [],
    checksReview: (reviews ?? []).find((r) => r.kind === "checks") ?? null,
    aiReview: (reviews ?? []).find((r) => r.kind === "ai") ?? null,
    stories: bundle.stories.map((s) => ({ id: s.id, title: s.title, outcome: s.outcome, verification: s.verification_status, tags: s.tags })),
    evidence: bundle.evidence.map((e) => ({ id: e.id, title: e.title, section: e.section, classification: e.classification })),
    documents: bundle.documents.map((d) => ({ id: d.id, title: d.title, doc_type: d.doc_type, extraction_status: d.extraction_status })),
    links: bundle.links,
    lessons: bundle.lessons,
    exemplars: attached.map((x) => ({ id: x.id, title: x.title, analysed: (analyses ?? []).some((a) => a.exemplar_id === x.id && a.source_hash === x.source_hash) })),
    exemplarTitles: bundle.exemplarTitles,
    exportDefaults: (profile?.export_settings ?? {}) as ExportSettings,
    authorName: profile?.full_name ?? "",
    aiConfigured: isAiConfigured(),
    aiEnabled: bundle.aiEnabled,
  };

  return <Workspace key={essay.id} data={data} />;
}
