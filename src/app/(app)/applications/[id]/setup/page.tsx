import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageContainer, PageHeader } from "@/components/page-header";
import { WizardSteps } from "@/components/applications/wizard-steps";
import { requireUser } from "@/lib/auth";
import { uuidParam } from "@/lib/api";
import type { Application, Essay, SupportingDocument } from "@/lib/domain/types";
import { SetupWizard } from "./setup-wizard";

export const metadata: Metadata = { title: "Application setup" };

export default async function SetupPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ step?: string }> }) {
  const { id } = await params;
  if (!uuidParam.safeParse(id).success) notFound();
  const { supabase } = await requireUser();
  const [{ data: app }, { data: essays }, { data: documents }] = await Promise.all([
    supabase.from("applications").select("*").eq("id", id).maybeSingle<Application>(),
    supabase.from("essays").select("*").eq("application_id", id).is("archived_at", null).order("position").returns<Essay[]>(),
    supabase.from("supporting_documents").select("*").eq("application_id", id).order("created_at", { ascending: false }).returns<SupportingDocument[]>(),
  ]);
  if (!app) notFound();
  const requested = Number((await searchParams).step);
  // Resume where the user left off; never jump past the furthest step reached.
  const reached = app.setup_completed_at ? 4 : app.setup_step;
  const step = Number.isInteger(requested) && requested >= 1 && requested <= 4 ? Math.min(requested, Math.max(reached, 1)) : reached;

  return (
    <PageContainer className="max-w-3xl">
      <PageHeader
        title={app.setup_completed_at ? "Edit application setup" : "Set up application"}
        eyebrow={`${app.programme} · ${app.institution}`}
        description="Your progress is saved after each step."
        back={{ href: app.setup_completed_at ? `/applications/${id}` : "/applications", label: app.setup_completed_at ? "Back to application" : "Applications" }}
      />
      <WizardSteps current={step} applicationId={id} reached={reached} />
      <SetupWizard application={app} essays={essays ?? []} documents={documents ?? []} step={step} />
    </PageContainer>
  );
}
