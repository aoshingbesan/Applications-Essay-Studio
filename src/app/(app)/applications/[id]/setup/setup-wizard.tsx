"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, ArrowRight, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/form-field";
import { SectionHeading } from "@/components/page-header";
import { OpportunityForm, opportunityDefaults } from "@/components/applications/opportunity-form";
import { PreferencesForm, preferenceDefaults } from "@/components/applications/preferences-form";
import { EssayList } from "@/components/applications/essay-list";
import { DocumentsPanel } from "@/components/documents/documents-panel";
import { applicationRequirementsSchema, type ApplicationRequirementsInput } from "@/lib/domain/schemas";
import type { Application, Essay, SupportingDocument } from "@/lib/domain/types";
import { setSetupStep, updateApplicationRequirements, updateOpportunity, updateWritingPreferences } from "@/server/applications";
import { handleResult } from "@/lib/client/result";

function ApplicationCriteriaForm({ application }: { application: Application }) {
  const form = useForm<ApplicationRequirementsInput>({
    resolver: zodResolver(applicationRequirementsSchema),
    defaultValues: { selection_criteria: application.selection_criteria ?? "", official_instructions: application.official_instructions ?? "" },
  });
  const { isSubmitting, isDirty, errors } = form.formState;
  return (
    <form
      onSubmit={form.handleSubmit(async (v) => {
        if (handleResult(await updateApplicationRequirements(application.id, v), "Requirements saved") !== null) form.reset(v);
      })}
      className="space-y-4"
    >
      <Field id="selection_criteria" label="Official selection criteria" hint="Paste them exactly, one per line. Reviews check your essays against these." error={errors.selection_criteria?.message}>
        <Textarea id="selection_criteria" rows={5} {...form.register("selection_criteria")} />
      </Field>
      <Field id="official_instructions" label="Official application instructions" error={errors.official_instructions?.message}>
        <Textarea id="official_instructions" rows={4} {...form.register("official_instructions")} />
      </Field>
      <Button type="submit" variant="outline" disabled={isSubmitting || !isDirty}>
        {isSubmitting && <Loader2 className="animate-spin" />} Save requirements
      </Button>
    </form>
  );
}

export function SetupWizard({ application, essays, documents, step }: { application: Application; essays: Essay[]; documents: SupportingDocument[]; step: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const id = application.id;
  const finished = Boolean(application.setup_completed_at);

  const go = async (next: number) => {
    setBusy(true);
    const ok = handleResult(await setSetupStep(id, next));
    setBusy(false);
    if (ok === null) return false;
    router.push(`/applications/${id}/setup?step=${next}`);
    return true;
  };

  const nav = (prev: number | null, next: () => Promise<unknown>, nextLabel = "Continue") => (
    <div className="mt-10 flex flex-wrap items-center justify-between gap-2 border-t pt-6">
      <div className="flex gap-2">
        {prev && (
          <Button variant="ghost" onClick={() => router.push(`/applications/${id}/setup?step=${prev}`)}>
            <ArrowLeft /> Back
          </Button>
        )}
        <Button asChild variant="ghost">
          <Link href={finished ? `/applications/${id}` : "/applications"}>Save and exit</Link>
        </Button>
      </div>
      <Button onClick={() => void next()} disabled={busy}>
        {busy && <Loader2 className="animate-spin" />} {nextLabel} <ArrowRight />
      </Button>
    </div>
  );

  if (step === 1) {
    return (
      <OpportunityForm
        initial={opportunityDefaults(application)}
        submitLabel="Save and continue"
        secondary={
          <Button asChild variant="ghost">
            <Link href={finished ? `/applications/${id}` : "/applications"}>Save and exit later</Link>
          </Button>
        }
        onSubmit={async (values) => {
          const ok = handleResult(await updateOpportunity(id, values));
          if (ok === null) return false;
          return go(2);
        }}
      />
    );
  }

  if (step === 2) {
    return (
      <div className="space-y-10">
        <section>
          <SectionHeading title="Essay questions" description="Add every essay this application requires. Each keeps its own prompt, word limit, outline, drafts and versions." />
          <EssayList applicationId={id} essays={essays} />
        </section>
        <section>
          <SectionHeading title="Application-wide requirements" />
          <ApplicationCriteriaForm application={application} />
        </section>
        {nav(1, async () => {
          if (essays.length === 0) toast.info("You can add essay questions later from the application page.");
          await go(3);
        })}
      </div>
    );
  }

  if (step === 3) {
    return (
      <div>
        <SectionHeading
          title="Supporting materials"
          description="CVs, transcripts, proposals, certificates, programme descriptions, scholarship guidance, previous statements and official instructions. Check the extracted text — only excerpts of documents you link to an essay are used by the AI."
        />
        <DocumentsPanel documents={documents} applicationId={id} />
        {nav(2, () => go(4))}
      </div>
    );
  }

  return (
    <div>
      <SectionHeading title="Writing preferences" description="These guide outlines and drafts for this application. They start from your defaults in Settings." />
      <PreferencesForm
        initial={preferenceDefaults(application.writing_preferences)}
        submitLabel={finished ? "Save preferences" : "Finish setup"}
        secondary={
          <Button variant="ghost" type="button" onClick={() => router.push(`/applications/${id}/setup?step=3`)}>
            <ArrowLeft /> Back
          </Button>
        }
        onSubmit={async (values) => {
          if (handleResult(await updateWritingPreferences(id, values)) === null) return false;
          if (handleResult(await setSetupStep(id, 4, true)) === null) return false;
          toast.success(finished ? "Preferences saved" : "Application set up");
          router.push(`/applications/${id}`);
          return true;
        }}
      />
    </div>
  );
}
