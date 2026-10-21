"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Archive, ArchiveRestore, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Field } from "@/components/form-field";
import { ConfirmAction } from "@/components/confirm-action";
import { ClassificationBadge } from "@/components/badges";
import {
  CLASSIFICATION_LABELS,
  EVIDENCE_CLASSIFICATIONS,
  EVIDENCE_SECTIONS,
  EVIDENCE_SECTION_LABELS,
  FUTURE_SECTIONS,
  type EvidenceSection,
} from "@/lib/domain/constants";
import { evidenceSchema, type EvidenceInput } from "@/lib/domain/schemas";
import type { PersonalEvidence, SupportingDocument } from "@/lib/domain/types";
import { deleteEvidence, saveEvidence, setEvidenceArchived } from "@/server/library";
import { handleResult } from "@/lib/client/result";
import { cn } from "@/lib/utils";

type Doc = Pick<SupportingDocument, "id" | "title">;

function EvidenceForm({ initial, entryId, documents, onDone }: { initial: EvidenceInput & { source_document_id: string | null }; entryId: string | null; documents: Doc[]; onDone: () => void }) {
  const form = useForm<EvidenceInput>({ resolver: zodResolver(evidenceSchema), defaultValues: initial });
  const [docId, setDocId] = useState(initial.source_document_id ?? "none");
  const { errors, isSubmitting } = form.formState;
  const section = useWatch({ control: form.control, name: "section" });
  const isFuture = FUTURE_SECTIONS.includes(section);

  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={form.handleSubmit(async (v) => {
        if (handleResult(await saveEvidence(entryId, v, docId === "none" ? null : docId), "Saved") !== null) onDone();
      })}
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field id="ev-section" label="Section">
          <Controller
            control={form.control}
            name="section"
            render={({ field }) => (
              <Select
                value={field.value}
                onValueChange={(v) => {
                  field.onChange(v);
                  // Future-facing sections default to "Goal or Aspiration".
                  if (FUTURE_SECTIONS.includes(v as EvidenceSection)) form.setValue("classification", "goal_aspiration");
                }}
              >
                <SelectTrigger id="ev-section" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EVIDENCE_SECTIONS.map((s) => (
                    <SelectItem key={s} value={s}>
                      {EVIDENCE_SECTION_LABELS[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </Field>
        <Field id="ev-class" label="Classification" hint={isFuture ? "Goals are always written as intentions, never as accomplishments." : undefined}>
          <Controller
            control={form.control}
            name="classification"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id="ev-class" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EVIDENCE_CLASSIFICATIONS.map((c) => (
                    <SelectItem key={c} value={c}>
                      {CLASSIFICATION_LABELS[c]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </Field>
      </div>
      <Field id="ev-title" label="Title" importance="critical" error={errors.title?.message}>
        <Input id="ev-title" placeholder="e.g. BSc Computer Science, First Class" {...form.register("title")} aria-invalid={Boolean(errors.title)} />
      </Field>
      <Field id="ev-details" label="Details" hint="Be specific: what, where, when, your role, and any figures you can verify." error={errors.details?.message}>
        <Textarea id="ev-details" rows={5} {...form.register("details")} />
      </Field>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field id="ev-org" label="Organisation" error={errors.organisation?.message}>
          <Input id="ev-org" {...form.register("organisation")} />
        </Field>
        <Field id="ev-period" label="Date or period" error={errors.period?.message}>
          <Input id="ev-period" placeholder="e.g. 2022–2024" {...form.register("period")} />
        </Field>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field id="ev-source" label="Source" hint="Where this can be verified." error={errors.source?.message}>
          <Input id="ev-source" placeholder="e.g. Final transcript, employer letter" {...form.register("source")} />
        </Field>
        <Field id="ev-doc" label="Supporting document">
          <Select value={docId} onValueChange={setDocId}>
            <SelectTrigger id="ev-doc" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None</SelectItem>
              {documents.map((d) => (
                <SelectItem key={d.id} value={d.id}>
                  {d.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>
      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting && <Loader2 className="animate-spin" />} Save entry
      </Button>
    </form>
  );
}

export function ProfileEditor({ evidence, documents }: { evidence: PersonalEvidence[]; documents: Doc[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<{ entry: PersonalEvidence | null; section: EvidenceSection } | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const visible = useMemo(() => evidence.filter((e) => showArchived || !e.archived_at), [evidence, showArchived]);
  const bySection = useMemo(() => {
    const m = new Map<EvidenceSection, PersonalEvidence[]>();
    for (const e of visible) m.set(e.section, [...(m.get(e.section) ?? []), e]);
    return m;
  }, [visible]);
  const unverified = evidence.filter((e) => !e.archived_at && e.classification === "unverified").length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {(() => {
            const n = evidence.filter((e) => !e.archived_at).length;
            return `${n} ${n === 1 ? "entry" : "entries"}`;
          })()}
          {unverified > 0 && <span className="text-warning"> · {unverified} need confirmation</span>}
        </p>
        <div className="flex items-center gap-2">
          <Switch id="show-archived" checked={showArchived} onCheckedChange={setShowArchived} />
          <Label htmlFor="show-archived" className="font-normal">
            Show archived
          </Label>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {EVIDENCE_SECTIONS.map((section) => {
          const items = bySection.get(section) ?? [];
          return (
            <section key={section} aria-labelledby={`sec-${section}`} className="rounded-xl border bg-card">
              <div className="flex items-center justify-between gap-2 border-b px-4 py-2.5">
                <h2 id={`sec-${section}`} className="text-sm font-semibold">
                  {EVIDENCE_SECTION_LABELS[section]}
                  {items.length > 0 && <span className="ml-1.5 font-normal text-muted-foreground">({items.length})</span>}
                </h2>
                <Button variant="ghost" size="sm" onClick={() => setEditing({ entry: null, section })} aria-label={`Add to ${EVIDENCE_SECTION_LABELS[section]}`}>
                  <Plus /> Add
                </Button>
              </div>
              {items.length === 0 ? (
                <p className="px-4 py-3 text-sm text-muted-foreground">Nothing recorded yet.</p>
              ) : (
                <ul className="divide-y">
                  {items.map((e) => (
                    <li key={e.id} className={cn("group px-4 py-3", e.archived_at && "opacity-60")}>
                      <div className="flex items-start gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium">{e.title}</div>
                          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                            <ClassificationBadge value={e.classification} />
                            {[e.organisation, e.period].filter(Boolean).join(" · ")}
                            {e.source && <span>Source: {e.source}</span>}
                          </div>
                          {e.details && <p className="mt-1.5 line-clamp-3 text-sm text-muted-foreground">{e.details}</p>}
                        </div>
                        <div className="flex shrink-0">
                          <Button variant="ghost" size="icon-sm" aria-label={`Edit ${e.title}`} onClick={() => setEditing({ entry: e, section: e.section })}>
                            <Pencil />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label={e.archived_at ? `Restore ${e.title}` : `Archive ${e.title}`}
                            onClick={async () => {
                              if (handleResult(await setEvidenceArchived(e.id, !e.archived_at)) !== null) router.refresh();
                            }}
                          >
                            {e.archived_at ? <ArchiveRestore /> : <Archive />}
                          </Button>
                          <ConfirmAction
                            trigger={
                              <Button variant="ghost" size="icon-sm" aria-label={`Delete ${e.title}`}>
                                <Trash2 />
                              </Button>
                            }
                            title={`Delete “${e.title}”?`}
                            description="It will be removed from your profile and from any essays it is linked to."
                            onConfirm={async () => {
                              if (handleResult(await deleteEvidence(e.id), "Deleted") === null) return false;
                              router.refresh();
                            }}
                          />
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>

      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{editing?.entry ? "Edit entry" : `Add to ${editing ? EVIDENCE_SECTION_LABELS[editing.section] : ""}`}</DialogTitle>
            <DialogDescription>Record only what is true. Mark anything you have not confirmed as “Unverified — Needs Confirmation”.</DialogDescription>
          </DialogHeader>
          {editing && (
            <EvidenceForm
              entryId={editing.entry?.id ?? null}
              documents={documents}
              initial={{
                section: editing.section,
                title: editing.entry?.title ?? "",
                details: editing.entry?.details ?? "",
                organisation: editing.entry?.organisation ?? "",
                period: editing.entry?.period ?? "",
                classification: editing.entry?.classification ?? (FUTURE_SECTIONS.includes(editing.section) ? "goal_aspiration" : "unverified"),
                source: editing.entry?.source ?? "",
                source_document_id: editing.entry?.source_document_id ?? null,
              }}
              onDone={() => {
                setEditing(null);
                router.refresh();
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
