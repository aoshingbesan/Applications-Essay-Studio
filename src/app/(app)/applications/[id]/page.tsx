import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ExternalLink, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageContainer, PageHeader, SectionHeading } from "@/components/page-header";
import { StatusBadge, ProvenanceBadge } from "@/components/badges";
import { DeadlineText } from "@/components/application-card";
import { EssayList } from "@/components/applications/essay-list";
import { DocumentsPanel } from "@/components/documents/documents-panel";
import { requireUser } from "@/lib/auth";
import { uuidParam } from "@/lib/api";
import { applicationProgress } from "@/lib/domain/progress";
import { APPLICATION_CATEGORY_LABELS } from "@/lib/domain/constants";
import type { Application, ApplicationRequirement, Essay, Exemplar, SupportingDocument } from "@/lib/domain/types";
import { ApplicationActions } from "./application-actions";
import { ChecklistPanel } from "./checklist-panel";
import { NotesPanel } from "./notes-panel";
import { ExemplarLinks } from "./exemplar-links";

export const metadata: Metadata = { title: "Application" };

function Detail({ label, value }: { label: string; value: string | null }) {
  if (!value?.trim()) return null;
  return (
    <div>
      <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{label}</h3>
      <p className="mt-1 text-sm whitespace-pre-line">{value}</p>
    </div>
  );
}

export default async function ApplicationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!uuidParam.safeParse(id).success) notFound();
  const { supabase } = await requireUser();
  const [{ data: app }, { data: essays }, { data: reqs }, { data: documents }, { data: links }, { data: allExemplars }] = await Promise.all([
    supabase.from("applications").select("*").eq("id", id).maybeSingle<Application>(),
    supabase.from("essays").select("*").eq("application_id", id).order("position").returns<Essay[]>(),
    supabase.from("application_requirements").select("*").eq("application_id", id).order("position").returns<ApplicationRequirement[]>(),
    supabase.from("supporting_documents").select("*").eq("application_id", id).order("created_at", { ascending: false }).returns<SupportingDocument[]>(),
    supabase.from("exemplar_application_links").select("exemplar_id").eq("application_id", id),
    supabase.from("exemplars").select("id, title, provenance, essay_category, institution, archived_at").order("updated_at", { ascending: false }).returns<Pick<Exemplar, "id" | "title" | "provenance" | "essay_category" | "institution" | "archived_at">[]>(),
  ]);
  if (!app) notFound();
  if (!app.setup_completed_at && (essays ?? []).length === 0) redirect(`/applications/${id}/setup`);

  const active = (essays ?? []).filter((e) => !e.archived_at);
  const archivedEssays = (essays ?? []).filter((e) => e.archived_at);
  const progress = applicationProgress(active, app.submitted_at);
  const linkedIds = new Set((links ?? []).map((l) => l.exemplar_id));
  const linked = (allExemplars ?? []).filter((x) => linkedIds.has(x.id));

  return (
    <PageContainer>
      <PageHeader
        back={{ href: "/applications", label: "Applications" }}
        eyebrow={`${APPLICATION_CATEGORY_LABELS[app.category]}${app.country ? ` · ${app.country}` : ""}`}
        title={app.programme || app.name}
        description={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>{app.institution}</span>
            <DeadlineText deadline={app.deadline} />
            {app.official_url && (
              <a href={app.official_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-ink hover:underline">
                Official page <ExternalLink className="size-3" aria-hidden />
              </a>
            )}
          </span>
        }
        actions={<ApplicationActions application={app} essays={active.map((e) => ({ id: e.id, title: e.title }))} />}
      />

      <div className="mb-8 grid gap-4 rounded-xl border bg-card p-4 sm:grid-cols-[auto_1fr] sm:items-center">
        <div className="flex items-center gap-3">
          <StatusBadge status={progress.status} />
          {app.archived_at && <span className="text-xs text-muted-foreground">Archived</span>}
        </div>
        <div className="space-y-1.5">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>
              {progress.essaysReady} of {progress.essaysTotal} essay{progress.essaysTotal === 1 ? "" : "s"} ready to submit
            </span>
            <span className="tabular-nums">{progress.percent}%</span>
          </div>
          <Progress value={progress.percent} aria-label="Application progress" />
        </div>
      </div>

      <Tabs defaultValue="essays">
        <TabsList className="mb-6 flex h-auto w-full flex-wrap justify-start sm:w-auto">
          <TabsTrigger value="essays">Essays ({active.length})</TabsTrigger>
          <TabsTrigger value="checklist">Checklist</TabsTrigger>
          <TabsTrigger value="exemplars">Exemplars ({linked.length})</TabsTrigger>
          <TabsTrigger value="documents">Documents ({documents?.length ?? 0})</TabsTrigger>
          <TabsTrigger value="details">Details</TabsTrigger>
          <TabsTrigger value="notes">Notes</TabsTrigger>
        </TabsList>

        <TabsContent value="essays" className="space-y-8">
          <EssayList applicationId={id} essays={active} showOpen />
          {archivedEssays.length > 0 && (
            <section>
              <SectionHeading title="Archived essays" />
              <ul className="space-y-1 text-sm text-muted-foreground">
                {archivedEssays.map((e) => (
                  <li key={e.id}>
                    <Link href={`/studio/${e.id}`} className="hover:underline">
                      {e.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </TabsContent>

        <TabsContent value="checklist">
          <ChecklistPanel applicationId={id} items={reqs ?? []} />
        </TabsContent>

        <TabsContent value="exemplars">
          <ExemplarLinks applicationId={id} linked={linked} available={(allExemplars ?? []).filter((x) => !x.archived_at && !linkedIds.has(x.id))} />
          {linked.length > 0 && (
            <ul className="mt-4 divide-y rounded-xl border bg-card">
              {linked.map((x) => (
                <li key={x.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <Link href={`/exemplars/${x.id}`} className="truncate text-sm font-medium hover:underline">
                    {x.title}
                  </Link>
                  <ProvenanceBadge value={x.provenance} />
                </li>
              ))}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="documents">
          <DocumentsPanel documents={documents ?? []} applicationId={id} />
        </TabsContent>

        <TabsContent value="details">
          <div className="mb-4 flex justify-end">
            <Button asChild variant="outline" size="sm">
              <Link href={`/applications/${id}/setup?step=1`}>
                <Settings2 /> Edit setup
              </Link>
            </Button>
          </div>
          <div className="grid gap-6 rounded-xl border bg-card p-5 md:grid-cols-2">
            <Detail label="Selection criteria" value={app.selection_criteria} />
            <Detail label="Official instructions" value={app.official_instructions} />
            <Detail label="Programme description" value={app.course_description} />
            <Detail label="Reason for applying" value={app.reason_for_applying} />
            {!app.selection_criteria && !app.official_instructions && !app.course_description && !app.reason_for_applying && (
              <p className="text-sm text-muted-foreground">No details recorded yet.</p>
            )}
          </div>
        </TabsContent>

        <TabsContent value="notes">
          <NotesPanel applicationId={id} initial={app.notes ?? ""} />
        </TabsContent>
      </Tabs>
    </PageContainer>
  );
}
