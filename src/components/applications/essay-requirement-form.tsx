"use client";

import { useForm, useWatch, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Field } from "@/components/form-field";
import { ListInput } from "@/components/list-input";
import { ESSAY_TYPES, ESSAY_TYPE_GUIDANCE, ESSAY_TYPE_LABELS } from "@/lib/domain/constants";
import { essayRequirementSchema, type EssayRequirementInput, type EssayRequirementValues } from "@/lib/domain/schemas";
import type { Essay } from "@/lib/domain/types";

export function essayDefaults(e?: Essay | null): EssayRequirementInput {
  return {
    title: e?.title ?? "",
    essay_type: e?.essay_type ?? "personal_statement",
    prompt: e?.prompt ?? "",
    min_words: e?.min_words ?? "",
    max_words: e?.max_words ?? "",
    required_themes: e?.required_themes ?? [],
    selection_criteria: e?.selection_criteria ?? "",
    required_format: e?.required_format ?? "",
    instructions: e?.instructions ?? "",
    restrictions: e?.restrictions ?? "",
  };
}

export function EssayRequirementForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial: EssayRequirementInput;
  submitLabel: string;
  onSubmit: (values: EssayRequirementInput) => Promise<boolean>;
  onCancel?: () => void;
}) {
  const form = useForm<EssayRequirementInput, unknown, EssayRequirementValues>({ resolver: zodResolver(essayRequirementSchema), defaultValues: initial });
  const { errors, isSubmitting } = form.formState;
  const type = useWatch({ control: form.control, name: "essay_type" });

  return (
    <form
      onSubmit={form.handleSubmit(async () => {
        // Submit the raw input: the server re-parses it with the same schema.
        await onSubmit(form.getValues());
      })}
      className="space-y-5"
      noValidate
    >
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-[1fr_16rem]">
        <Field id="essay-title" label="Essay title" importance="critical" error={errors.title?.message}>
          <Input id="essay-title" placeholder="e.g. Leadership and influencing" {...form.register("title")} aria-invalid={Boolean(errors.title)} />
        </Field>
        <Field id="essay-type" label="Essay type">
          <Controller
            control={form.control}
            name="essay_type"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id="essay-type" className="w-full">
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
      <p className="-mt-2 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">Guidance: </span>
        {ESSAY_TYPE_GUIDANCE[type]} The official instructions always take priority.
      </p>
      <Field id="essay-prompt" label="Exact essay prompt" importance="critical" hint="Paste the official wording exactly. It is never rewritten." error={errors.prompt?.message}>
        <Textarea id="essay-prompt" rows={5} className="font-serif" {...form.register("prompt")} />
      </Field>
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <Field id="min-words" label="Minimum word count" error={errors.min_words?.message}>
          <Input id="min-words" type="number" inputMode="numeric" min={0} {...form.register("min_words")} />
        </Field>
        <Field id="max-words" label="Maximum word count" importance="recommended" error={errors.max_words?.message}>
          <Input id="max-words" type="number" inputMode="numeric" min={1} {...form.register("max_words")} />
        </Field>
      </div>
      <Field id="themes" label="Required themes" hint="Press Enter to add each theme the prompt requires.">
        <Controller control={form.control} name="required_themes" render={({ field }) => <ListInput id="themes" value={field.value} onChange={field.onChange} placeholder="e.g. Leadership" />} />
      </Field>
      <Field id="essay-criteria" label="Selection criteria for this essay" hint="One per line. Leave blank to use the application's criteria." error={errors.selection_criteria?.message}>
        <Textarea id="essay-criteria" rows={3} {...form.register("selection_criteria")} />
      </Field>
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <Field id="format" label="Required format" error={errors.required_format?.message}>
          <Textarea id="format" rows={2} placeholder="e.g. Plain text, no headings" {...form.register("required_format")} />
        </Field>
        <Field id="restrictions" label="Submission restrictions" error={errors.restrictions?.message}>
          <Textarea id="restrictions" rows={2} placeholder="e.g. No links or attachments" {...form.register("restrictions")} />
        </Field>
      </div>
      <Field id="instructions" label="Official instructions for this essay" error={errors.instructions?.message}>
        <Textarea id="instructions" rows={3} {...form.register("instructions")} />
      </Field>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="animate-spin" />} {submitLabel}
        </Button>
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}
