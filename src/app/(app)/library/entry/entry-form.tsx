"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ChevronRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Field } from "@/components/form-field";
import { ListInput } from "@/components/list-input";
import { CLASSIFICATION_DESCRIPTIONS, CLASSIFICATION_LABELS, EVIDENCE_CLASSIFICATIONS } from "@/lib/domain/constants";
import { entrySchema, type EntryInput } from "@/lib/domain/schemas";
import type { SupportingDocument } from "@/lib/domain/types";
import { ENTRY_SECTIONS, PRIVACY_DESCRIPTIONS, PRIVACY_LABELS, PRIVACY_LEVELS, SECTION_BY_KEY, isFutureSection, type EntrySection, type Privacy } from "@/lib/library/sections";

export { entryDefaults } from "@/lib/library/entry-defaults";
import { saveEntry } from "@/server/library";
import { handleResult } from "@/lib/client/result";

function Part({ title, description, open = true, children }: { title: string; description?: string; open?: boolean; children: React.ReactNode }) {
  return (
    <details open={open} className="group rounded-xl border bg-card">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-5 py-3.5 select-none [&::-webkit-details-marker]:hidden">
        <ChevronRight className="size-4 text-muted-foreground transition-transform group-open:rotate-90" aria-hidden />
        <span className="text-sm font-semibold">{title}</span>
        {description && <span className="hidden text-xs text-muted-foreground sm:inline">— {description}</span>}
      </summary>
      <div className="space-y-5 border-t px-5 py-5">{children}</div>
    </details>
  );
}

export function EntryForm({
  entryId,
  initial,
  documents,
  linkedDocumentIds,
  sectionDefaults,
}: {
  entryId: string | null;
  initial: EntryInput;
  documents: Pick<SupportingDocument, "id" | "title">[];
  linkedDocumentIds: string[];
  sectionDefaults: Record<string, Privacy>;
}) {
  const router = useRouter();
  const form = useForm<EntryInput>({ resolver: zodResolver(entrySchema) as never, defaultValues: initial });
  const [docIds, setDocIds] = useState<string[]>(linkedDocumentIds);
  const section = useWatch({ control: form.control, name: "section" }) as EntrySection;
  const alsoIn = useWatch({ control: form.control, name: "also_in" }) as EntrySection[];
  const labels = SECTION_BY_KEY[section]?.labels ?? { organisation: "Organisation", role: "Role" };
  const future = isFutureSection(section);
  const { errors, isSubmitting, isDirty } = form.formState;
  const area = (name: keyof EntryInput, label: string, hint?: string, rows = 3) => (
    <Field id={`en-${name}`} label={label} hint={hint} error={errors[name]?.message as string | undefined}>
      <Textarea id={`en-${name}`} rows={rows} {...form.register(name)} />
    </Field>
  );
  const input = (name: keyof EntryInput, label: string, hint?: string, placeholder?: string) => (
    <Field id={`en-${name}`} label={label} hint={hint} error={errors[name]?.message as string | undefined}>
      <Input id={`en-${name}`} placeholder={placeholder} {...form.register(name)} />
    </Field>
  );
  const docsChanged = docIds.length !== linkedDocumentIds.length || docIds.some((d) => !linkedDocumentIds.includes(d));

  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={form.handleSubmit(async () => {
        const res = handleResult(await saveEntry(entryId, form.getValues(), docIds), "Entry saved");
        if (!res) return;
        if (!entryId) router.replace(`/library/entry/${res.id}`);
        else {
          form.reset(form.getValues());
          router.refresh();
        }
      })}
    >
      <Part title="Basics">
        <Field id="en-title" label="Title" importance="critical" error={errors.title?.message}>
          <Input id="en-title" placeholder="e.g. Founded the campus coding club" {...form.register("title")} aria-invalid={Boolean(errors.title)} />
        </Field>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Field id="en-section" label="Section">
            <Controller
              control={form.control}
              name="section"
              render={({ field }) => (
                <Select
                  value={field.value}
                  onValueChange={(v) => {
                    field.onChange(v);
                    if (!entryId) {
                      form.setValue("privacy", sectionDefaults[v] ?? SECTION_BY_KEY[v as EntrySection].defaultPrivacy);
                      if (isFutureSection(v)) form.setValue("classification", "goal_aspiration");
                    }
                  }}
                >
                  <SelectTrigger id="en-section" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ENTRY_SECTIONS.map((k) => (
                      <SelectItem key={k} value={k}>
                        {SECTION_BY_KEY[k].number} · {SECTION_BY_KEY[k].title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </Field>
          <Field id="en-class" label="What kind of information is this?" hint={CLASSIFICATION_DESCRIPTIONS[form.getValues("classification")]}>
            <Controller
              control={form.control}
              name="classification"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="en-class" className="w-full">
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
        {future && <p className="-mt-2 text-xs text-muted-foreground">This is a goals section: drafts always write it as an intention, never as something already done.</p>}

        <fieldset>
          <legend className="text-sm font-medium">Also show this entry in</legend>
          <p className="text-xs text-muted-foreground">One entry, listed in several sections — edit it once.</p>
          <div className="mt-2 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {ENTRY_SECTIONS.filter((k) => k !== section).map((k) => (
              <div key={k} className="flex items-center gap-2">
                <Checkbox
                  id={`also-${k}`}
                  checked={alsoIn.includes(k)}
                  onCheckedChange={(v) => form.setValue("also_in", v === true ? [...alsoIn, k] : alsoIn.filter((x) => x !== k), { shouldDirty: true })}
                />
                <Label htmlFor={`also-${k}`} className="text-sm font-normal">
                  {SECTION_BY_KEY[k].title}
                </Label>
              </div>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className="text-sm font-medium">Who can use this entry</legend>
          <Controller
            control={form.control}
            name="privacy"
            render={({ field }) => (
              <RadioGroup value={field.value} onValueChange={field.onChange} className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
                {PRIVACY_LEVELS.map((p) => (
                  <Label key={p} htmlFor={`pv-${p}`} className="flex cursor-pointer items-start gap-2.5 rounded-lg border p-3 font-normal has-[[data-state=checked]]:border-ink has-[[data-state=checked]]:bg-accent/40">
                    <RadioGroupItem id={`pv-${p}`} value={p} className="mt-0.5" />
                    <span>
                      <span className="block text-sm font-medium">{PRIVACY_LABELS[p]}</span>
                      <span className="block text-xs text-muted-foreground">{PRIVACY_DESCRIPTIONS[p]}</span>
                    </span>
                  </Label>
                ))}
              </RadioGroup>
            )}
          />
        </fieldset>
      </Part>

      <Part title="Facts" description="dates, roles, places, figures">
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          {input("organisation", labels.organisation)}
          {input("role", labels.role)}
          {input("period", "Date or period", undefined, "e.g. Sept 2022 – June 2024")}
          {input("location", "Location")}
        </div>
        {area("summary", "Summary", "Two or three sentences: what it was and why it matters.", 3)}
        {input("figures", "Figures and results", "Only numbers you can stand behind — leave blank rather than estimate.", "e.g. 60 members; 12 alumni now study computing")}
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          {input("links", "Links", undefined, "Portfolio, repository, article…")}
          {input("source", "Where this can be verified", undefined, "e.g. transcript, employer letter")}
        </div>
      </Part>

      <Part title="The story" description="optional STAR structure" open={Boolean(initial.context || initial.actions || initial.outcome)}>
        <p className="-mt-1 text-xs text-muted-foreground">Fill in only what fits — not every entry is a story.</p>
        {area("context", "Context", "Where and when; what was the situation?")}
        {area("challenge", "Challenge or opportunity")}
        {area("actions", "What you did", "Your own actions and decisions — separate them from the team's.", 4)}
        {area("outcome", "Outcome")}
        {area("measurable_impact", "Measurable impact", undefined, 2)}
        {area("lessons", "What you learned")}
        {area("motivation", "Why it mattered to you", undefined, 2)}
      </Part>

      <Part title="In your own words" description="the long-form version">
        {area("narrative", "Narrative", "Tell it the way you would to a friend. Essays use your phrasing and voice as a guide, never copy it wholesale.", 10)}
      </Part>

      <Part title="Connections" open={false}>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Field id="en-skills" label="Skills shown">
            <Controller control={form.control} name="skills" render={({ field }) => <ListInput id="en-skills" value={field.value} onChange={field.onChange} placeholder="e.g. negotiation" />} />
          </Field>
          <Field id="en-criteria" label="Selection criteria it evidences">
            <Controller control={form.control} name="related_criteria" render={({ field }) => <ListInput id="en-criteria" value={field.value} onChange={field.onChange} placeholder="e.g. leadership and influencing" />} />
          </Field>
          <Field id="en-tags" label="Tags">
            <Controller control={form.control} name="tags" render={({ field }) => <ListInput id="en-tags" value={field.value} onChange={field.onChange} placeholder="e.g. digital health" />} />
          </Field>
        </div>
      </Part>

      <Part title="Supporting documents" description="what proves this" open={linkedDocumentIds.length > 0}>
        {documents.length === 0 ? (
          <p className="text-sm text-muted-foreground">No documents yet. Upload them under Supporting Documents, then link them here.</p>
        ) : (
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {documents.map((d) => (
              <div key={d.id} className="flex items-center gap-2">
                <Checkbox id={`doc-${d.id}`} checked={docIds.includes(d.id)} onCheckedChange={(v) => setDocIds((s) => (v === true ? [...s, d.id] : s.filter((x) => x !== d.id)))} />
                <Label htmlFor={`doc-${d.id}`} className="text-sm font-normal">
                  {d.title}
                </Label>
              </div>
            ))}
          </div>
        )}
      </Part>

      <div className="sticky bottom-0 -mx-4 flex items-center gap-2 border-t bg-background/95 px-4 py-3 backdrop-blur sm:mx-0 sm:px-0">
        <Button type="submit" disabled={isSubmitting || (!!entryId && !isDirty && !docsChanged)}>
          {isSubmitting && <Loader2 className="animate-spin" />} {entryId ? "Save changes" : "Save entry"}
        </Button>
        {entryId && (isDirty || docsChanged) && <span className="text-xs text-muted-foreground">Unsaved changes</span>}
      </div>
    </form>
  );
}
