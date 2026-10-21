"use client";

import { Controller, type UseFormReturn } from "react-hook-form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Field } from "@/components/form-field";
import { ListInput } from "@/components/list-input";
import { ESSAY_TYPES, ESSAY_TYPE_LABELS, EXEMPLAR_PROVENANCE, PROVENANCE_DESCRIPTIONS, PROVENANCE_LABELS } from "@/lib/domain/constants";
import type { ExemplarMetaInput, ExemplarMetaValues } from "@/lib/domain/schemas";
import type { Exemplar } from "@/lib/domain/types";

export function exemplarMetaDefaults(x?: Exemplar | null): ExemplarMetaInput {
  return {
    title: x?.title ?? "",
    essay_category: x?.essay_category ?? "statement_of_purpose",
    institution: x?.institution ?? "",
    programme: x?.programme ?? "",
    author_attribution: x?.author_attribution ?? "",
    original_prompt: x?.original_prompt ?? "",
    original_word_limit: x?.original_word_limit ?? "",
    application_year: x?.application_year ?? "",
    source_url: x?.source_url ?? "",
    provenance: x?.provenance ?? "unknown",
    notes: x?.notes ?? "",
    tags: x?.tags ?? [],
  };
}

export function ExemplarMetaFields({ form }: { form: UseFormReturn<ExemplarMetaInput, unknown, ExemplarMetaValues> }) {
  const { errors } = form.formState;
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_15rem]">
        <Field id="ex-title" label="Title" importance="critical" error={errors.title?.message}>
          <Input id="ex-title" placeholder="e.g. Rhodes personal statement sample" {...form.register("title")} aria-invalid={Boolean(errors.title)} />
        </Field>
        <Field id="ex-category" label="Essay category">
          <Controller
            control={form.control}
            name="essay_category"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id="ex-category" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ESSAY_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {ESSAY_TYPE_LABELS[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </Field>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field id="ex-inst" label="Institution, scholarship or programme">
          <Input id="ex-inst" {...form.register("institution")} />
        </Field>
        <Field id="ex-prog" label="Programme">
          <Input id="ex-prog" {...form.register("programme")} />
        </Field>
        <Field id="ex-author" label="Author attribution" hint="Only when known and appropriate to record.">
          <Input id="ex-author" {...form.register("author_attribution")} />
        </Field>
        <Field id="ex-url" label="Source URL" error={errors.source_url?.message}>
          <Input id="ex-url" type="url" placeholder="https://" {...form.register("source_url")} />
        </Field>
        <Field id="ex-limit" label="Original word limit" error={errors.original_word_limit?.message}>
          <Input id="ex-limit" type="number" inputMode="numeric" {...form.register("original_word_limit")} />
        </Field>
        <Field id="ex-year" label="Application year" error={errors.application_year?.message}>
          <Input id="ex-year" type="number" inputMode="numeric" {...form.register("application_year")} />
        </Field>
      </div>
      <Field id="ex-prompt" label="Original application prompt" hint="If available. Enables the prompt-alignment part of the analysis.">
        <Textarea id="ex-prompt" rows={3} className="font-serif" {...form.register("original_prompt")} />
      </Field>
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Provenance</legend>
        <p className="text-xs text-muted-foreground">State only what you know. Uploading an essay does not imply it was successful.</p>
        <Controller
          control={form.control}
          name="provenance"
          render={({ field }) => (
            <RadioGroup value={field.value} onValueChange={field.onChange} className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {EXEMPLAR_PROVENANCE.map((p) => (
                <Label key={p} htmlFor={`prov-${p}`} className="flex cursor-pointer items-start gap-2.5 rounded-lg border p-3 font-normal has-[[data-state=checked]]:border-ink has-[[data-state=checked]]:bg-accent/40">
                  <RadioGroupItem id={`prov-${p}`} value={p} className="mt-0.5" />
                  <span>
                    <span className="block text-sm font-medium">{PROVENANCE_LABELS[p]}</span>
                    <span className="block text-xs text-muted-foreground">{PROVENANCE_DESCRIPTIONS[p]}</span>
                  </span>
                </Label>
              ))}
            </RadioGroup>
          )}
        />
      </fieldset>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field id="ex-tags" label="Tags">
          <Controller control={form.control} name="tags" render={({ field }) => <ListInput id="ex-tags" value={field.value} onChange={field.onChange} placeholder="e.g. leadership" />} />
        </Field>
        <Field id="ex-notes" label="Your notes">
          <Textarea id="ex-notes" rows={3} {...form.register("notes")} />
        </Field>
      </div>
    </div>
  );
}
