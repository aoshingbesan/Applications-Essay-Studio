"use client";

import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Field } from "@/components/form-field";
import { ListInput } from "@/components/list-input";
import { FORMALITY_LEVELS, TONES } from "@/lib/domain/constants";
import { writingPreferencesSchema, type WritingPreferencesInput } from "@/lib/domain/schemas";
import type { WritingPreferences } from "@/lib/domain/types";

type Values = Required<Omit<WritingPreferencesInput, "spelling">> & { spelling: "british" | "american" };

export function preferenceDefaults(p?: WritingPreferences | null): Values {
  return {
    tone: p?.tone ?? "",
    formality: p?.formality ?? "",
    style: p?.style ?? "",
    themes: p?.themes ?? [],
    experiences: p?.experiences ?? "",
    avoid: p?.avoid ?? "",
    voice: p?.voice ?? "",
    instructions: p?.instructions ?? "",
    spelling: p?.spelling ?? "british",
  };
}

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function PreferencesForm({
  initial,
  submitLabel,
  onSubmit,
  secondary,
  compact,
}: {
  initial: Values;
  submitLabel: string;
  onSubmit: (values: WritingPreferencesInput) => Promise<boolean>;
  secondary?: React.ReactNode;
  compact?: boolean;
}) {
  const form = useForm<Values>({ resolver: zodResolver(writingPreferencesSchema) as never, defaultValues: initial });
  const { isSubmitting, errors } = form.formState;

  const choice = (name: "tone" | "formality", label: string, options: readonly string[]) => (
    <Field id={`pref-${name}`} label={label}>
      <Controller
        control={form.control}
        name={name}
        render={({ field }) => (
          <Select value={field.value || "none"} onValueChange={(v) => field.onChange(v === "none" ? "" : v)}>
            <SelectTrigger id={`pref-${name}`} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No preference</SelectItem>
              {options.map((o) => (
                <SelectItem key={o} value={o}>
                  {capital(o)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      />
    </Field>
  );

  return (
    <form onSubmit={form.handleSubmit(async (v) => void (await onSubmit(v)))} className="space-y-5" noValidate>
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
        {choice("tone", "Preferred tone", TONES)}
        {choice("formality", "Level of formality", FORMALITY_LEVELS)}
        <Field id="pref-spelling" label="Spelling">
          <Controller
            control={form.control}
            name="spelling"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id="pref-spelling" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="british">British English</SelectItem>
                  <SelectItem value="american">American English</SelectItem>
                </SelectContent>
              </Select>
            )}
          />
        </Field>
      </div>
      <Field id="pref-voice" label="Preferred first-person voice" hint="e.g. “Plain and direct, short sentences, no jargon”." error={errors.voice?.message}>
        <Input id="pref-voice" {...form.register("voice")} />
      </Field>
      {!compact && (
        <Field id="pref-style" label="Writing style preferences" error={errors.style?.message}>
          <Textarea id="pref-style" rows={2} {...form.register("style")} />
        </Field>
      )}
      <Field id="pref-themes" label="Important themes">
        <Controller control={form.control} name="themes" render={({ field }) => <ListInput id="pref-themes" value={field.value} onChange={field.onChange} placeholder="e.g. Digital inclusion" />} />
      </Field>
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <Field id="pref-experiences" label="Relevant experiences to feature" error={errors.experiences?.message}>
          <Textarea id="pref-experiences" rows={3} {...form.register("experiences")} />
        </Field>
        <Field id="pref-avoid" label="Topics to avoid" hint="These are never mentioned in AI drafts." error={errors.avoid?.message}>
          <Textarea id="pref-avoid" rows={3} {...form.register("avoid")} />
        </Field>
      </div>
      <Field id="pref-instructions" label="Additional instructions" error={errors.instructions?.message}>
        <Textarea id="pref-instructions" rows={2} {...form.register("instructions")} />
      </Field>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="animate-spin" />} {submitLabel}
        </Button>
        {secondary}
      </div>
    </form>
  );
}
