"use client";

import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Field } from "@/components/form-field";
import { APPLICATION_CATEGORIES, APPLICATION_CATEGORY_LABELS } from "@/lib/domain/constants";
import { opportunitySchema, type OpportunityInput } from "@/lib/domain/schemas";
import type { Application } from "@/lib/domain/types";

export function opportunityDefaults(a?: Application | null): OpportunityInput {
  return {
    institution: a?.institution ?? "",
    programme: a?.programme ?? "",
    name: a?.name ?? "",
    category: a?.category ?? "masters_admission",
    country: a?.country ?? "",
    official_url: a?.official_url ?? "",
    deadline: a?.deadline ? a.deadline.slice(0, 10) : "",
    course_description: a?.course_description ?? "",
    reason_for_applying: a?.reason_for_applying ?? "",
  };
}

export function OpportunityForm({
  initial,
  submitLabel,
  onSubmit,
  secondary,
}: {
  initial: OpportunityInput;
  submitLabel: string;
  onSubmit: (values: OpportunityInput) => Promise<boolean>;
  secondary?: React.ReactNode;
}) {
  const form = useForm<OpportunityInput>({ resolver: zodResolver(opportunitySchema), defaultValues: initial });
  const { errors, isSubmitting } = form.formState;
  const reg = (name: keyof OpportunityInput) => ({ ...form.register(name), "aria-invalid": Boolean(errors[name]), "aria-describedby": errors[name] ? `${name}-error` : undefined });

  return (
    <form onSubmit={form.handleSubmit(async (v) => void (await onSubmit(v)))} className="space-y-5" noValidate>
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <Field id="institution" label="Institution or organisation" importance="critical" error={errors.institution?.message}>
          <Input id="institution" placeholder="e.g. University of Oxford" {...reg("institution")} />
        </Field>
        <Field id="programme" label="Programme or scholarship" importance="critical" error={errors.programme?.message}>
          <Input id="programme" placeholder="e.g. MSc Development Studies" {...reg("programme")} />
        </Field>
        <Field id="category" label="Application category" error={errors.category?.message}>
          <Controller
            control={form.control}
            name="category"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id="category" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {APPLICATION_CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {APPLICATION_CATEGORY_LABELS[c]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </Field>
        <Field id="country" label="Country" error={errors.country?.message}>
          <Input id="country" {...reg("country")} />
        </Field>
        <Field id="official_url" label="Official programme URL" error={errors.official_url?.message}>
          <Input id="official_url" type="url" inputMode="url" placeholder="https://" {...reg("official_url")} />
        </Field>
        <Field id="deadline" label="Application deadline" importance="recommended" error={errors.deadline?.message}>
          <Input id="deadline" type="date" {...reg("deadline")} />
        </Field>
      </div>
      <Field id="name" label="Application name" hint="Optional. Defaults to “Programme — Institution”." error={errors.name?.message}>
        <Input id="name" {...reg("name")} />
      </Field>
      <Field id="course_description" label="Course or programme description" hint="Paste the official description. It is used to tailor programme fit — the AI will not invent programme details." error={errors.course_description?.message}>
        <Textarea id="course_description" rows={5} {...reg("course_description")} />
      </Field>
      <Field id="reason_for_applying" label="Your reason for applying" hint="In your own words. This helps keep drafts authentic." error={errors.reason_for_applying?.message}>
        <Textarea id="reason_for_applying" rows={4} {...reg("reason_for_applying")} />
      </Field>
      <div className="flex flex-wrap items-center gap-2 pt-2">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="animate-spin" />} {submitLabel}
        </Button>
        {secondary}
      </div>
    </form>
  );
}
