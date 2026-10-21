import type { Metadata } from "next";
import { PageContainer, PageHeader } from "@/components/page-header";
import { UploadExemplarDialog } from "@/components/exemplars/upload-exemplar-dialog";
import { requireUser } from "@/lib/auth";
import { EXEMPLAR_SPEC_VERSION } from "@/lib/ai/prompts/exemplars";
import { analysisDisplay } from "@/lib/exemplars/status";
import type { Exemplar, ExemplarAnalysis } from "@/lib/domain/types";
import { ExemplarLibrary, type LibraryItem } from "./exemplar-library";

export const metadata: Metadata = { title: "Exemplar Library" };

export default async function ExemplarsPage() {
  const { supabase } = await requireUser();
  const [{ data: exemplars }, { data: analyses }] = await Promise.all([
    supabase
      .from("exemplars")
      .select("id, title, essay_category, institution, programme, application_year, provenance, tags, word_count, extraction_status, source_hash, archived_at, updated_at")
      .order("updated_at", { ascending: false })
      .returns<Exemplar[]>(),
    supabase
      .from("exemplar_analyses")
      .select("exemplar_id, status, source_hash, spec_version, created_at")
      .order("created_at", { ascending: false })
      .returns<(Pick<ExemplarAnalysis, "exemplar_id" | "status" | "source_hash" | "spec_version" | "created_at">)[]>(),
  ]);
  const latest = new Map<string, (typeof analyses & object)[number]>();
  for (const a of analyses ?? []) if (!latest.has(a.exemplar_id)) latest.set(a.exemplar_id, a);
  const items: LibraryItem[] = (exemplars ?? []).map((x) => ({
    id: x.id,
    title: x.title,
    essay_category: x.essay_category,
    institution: x.institution,
    programme: x.programme,
    application_year: x.application_year,
    provenance: x.provenance,
    tags: x.tags,
    word_count: x.word_count,
    extraction_status: x.extraction_status,
    archived: Boolean(x.archived_at),
    analysis: analysisDisplay(x, latest.get(x.id), EXEMPLAR_SPEC_VERSION),
  }));

  return (
    <PageContainer>
      <PageHeader
        title="Exemplar Library"
        description="Analyse successful essays to understand how they work — structure, openings, evidence, tone — then apply the lessons to your own original writing. Exemplars stay read-only and are never copied into drafts."
        actions={<UploadExemplarDialog />}
      />
      <ExemplarLibrary items={items} />
    </PageContainer>
  );
}
