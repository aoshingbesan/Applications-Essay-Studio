import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { PageContainer, PageHeader } from "@/components/page-header";
import { ProvenanceBadge } from "@/components/badges";
import { ReportView, REPORT_SECTIONS } from "@/components/exemplars/report-view";
import { requireUser } from "@/lib/auth";
import { uuidParam } from "@/lib/api";
import { EXEMPLAR_SPEC_VERSION } from "@/lib/ai/prompts/exemplars";
import { analysisDisplay } from "@/lib/exemplars/status";
import { selectableLessons } from "@/lib/exemplars/lessons";
import { ESSAY_TYPE_LABELS } from "@/lib/domain/constants";
import { isAiConfigured } from "@/lib/ai/client";
import { formatDateTime } from "@/lib/format/date";
import type { Application, Exemplar, ExemplarAnalysis } from "@/lib/domain/types";
import { AnalysisControl } from "./analysis-control";
import { ExemplarActions } from "./exemplar-actions";
import { SourceTextPanel } from "./source-text-panel";
import { LessonPicker } from "./lesson-picker";

export const metadata: Metadata = { title: "Exemplar" };

export default async function ExemplarPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!uuidParam.safeParse(id).success) notFound();
  const { supabase } = await requireUser();
  const [{ data: exemplar }, { data: analyses }, { data: apps }, { data: links }, { data: essays }, { data: selected }] = await Promise.all([
    supabase.from("exemplars").select("*").eq("id", id).maybeSingle<Exemplar>(),
    supabase.from("exemplar_analyses").select("*").eq("exemplar_id", id).order("created_at", { ascending: false }).limit(10).returns<ExemplarAnalysis[]>(),
    supabase.from("applications").select("id, name, programme, institution").is("archived_at", null).order("created_at", { ascending: false }).returns<Pick<Application, "id" | "name" | "programme" | "institution">[]>(),
    supabase.from("exemplar_application_links").select("application_id").eq("exemplar_id", id),
    supabase
      .from("essays")
      .select("id, title, application_id, applications(programme, name)")
      .is("archived_at", null)
      .order("updated_at", { ascending: false })
      .returns<{ id: string; title: string; application_id: string; applications: { programme: string; name: string } | null }[]>(),
    supabase.from("exemplar_selected_lessons").select("essay_id, lesson_key").eq("exemplar_id", id).returns<{ essay_id: string | null; lesson_key: string }[]>(),
  ]);
  if (!exemplar) notFound();

  const latest = analyses?.[0] ?? null;
  const display = analysisDisplay(exemplar, latest, EXEMPLAR_SPEC_VERSION);
  // Only an analysis of this exact text and specification is shown as current.
  const current = (analyses ?? []).find((a) => a.status === "complete" && a.source_hash === exemplar.source_hash && a.spec_version === EXEMPLAR_SPEC_VERSION && a.report);
  const previous = !current ? (analyses ?? []).find((a) => a.status === "complete" && a.report) : null;
  const linkedIds = (links ?? []).map((l) => l.application_id);
  const essayOptions = (essays ?? []).map((e) => ({ id: e.id, label: `${e.title} — ${e.applications?.programme || e.applications?.name || ""}`, applicationId: e.application_id }));

  return (
    <PageContainer wide>
      <PageHeader
        back={{ href: "/exemplars", label: "Exemplar Library" }}
        eyebrow={[ESSAY_TYPE_LABELS[exemplar.essay_category], exemplar.institution, exemplar.programme, exemplar.application_year].filter(Boolean).join(" · ")}
        title={exemplar.title}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <ProvenanceBadge value={exemplar.provenance} />
            {exemplar.author_attribution && <span>By {exemplar.author_attribution}</span>}
            {exemplar.source_url && (
              <a className="text-ink hover:underline" href={exemplar.source_url} target="_blank" rel="noopener noreferrer">
                Source
              </a>
            )}
            {exemplar.archived_at && <span>Archived</span>}
          </span>
        }
        actions={<ExemplarActions exemplar={exemplar} applications={apps ?? []} linkedIds={linkedIds} />}
      />

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-6">
          <AnalysisControl
            exemplarId={exemplar.id}
            display={exemplar.extraction_status === "extracted" && exemplar.word_count >= 50 ? display : "unavailable"}
            error={latest?.status === "failed" ? latest.error_message : null}
            analysedAt={current?.completed_at ?? null}
            model={current?.model ?? null}
            aiConfigured={isAiConfigured()}
          />

          {current?.report ? (
            <ReportView report={current.report} />
          ) : previous?.report ? (
            <>
              <Alert>
                <AlertTitle>This report describes an earlier version</AlertTitle>
                <AlertDescription>The essay text or the analysis specification has changed since it was produced. Reanalyse to get a report for the current text.</AlertDescription>
              </Alert>
              <details className="rounded-xl border bg-card p-4">
                <summary className="cursor-pointer text-sm font-medium">Show the earlier report ({formatDateTime(previous.completed_at)})</summary>
                <ReportView report={previous.report} className="mt-6 opacity-80" />
              </details>
            </>
          ) : (
            <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
              No analysis yet. Check the essay text on the right, then run the analysis. It produces a structured report: overview, opening, structure, evidence, prompt alignment, techniques, limitations, transferable lessons and a reusable writing blueprint.
            </div>
          )}
        </div>

        <aside className="space-y-6 lg:sticky lg:top-6 lg:self-start">
          {current?.report && (
            <nav aria-label="Report sections" className="hidden rounded-xl border bg-card p-3 lg:block">
              <ul className="space-y-0.5 text-sm">
                {REPORT_SECTIONS.map(([sid, label]) => (
                  <li key={sid}>
                    <a href={`#${sid}`} className="block rounded px-2 py-1 text-muted-foreground hover:bg-muted hover:text-foreground">
                      {label}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          )}
          {current?.report && (
            <LessonPicker
              exemplarId={exemplar.id}
              analysisId={current.id}
              lessons={selectableLessons(current.report)}
              essays={essayOptions}
              selected={(selected ?? []).filter((s) => s.essay_id).map((s) => ({ essayId: s.essay_id!, key: s.lesson_key }))}
            />
          )}
          <SourceTextPanel exemplar={exemplar} />
        </aside>
      </div>
    </PageContainer>
  );
}
