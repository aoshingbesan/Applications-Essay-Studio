"use client";

import { useRouter } from "next/navigation";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Field } from "@/components/form-field";
import { ListInput } from "@/components/list-input";
import { STORY_VERIFICATION, STORY_VERIFICATION_LABELS } from "@/lib/domain/constants";
import { storySchema, type StoryInput } from "@/lib/domain/schemas";
import type { Story } from "@/lib/domain/types";
import { saveStory } from "@/server/library";
import { handleResult } from "@/lib/client/result";

export function storyDefaults(s?: Story | null): StoryInput {
  return {
    title: s?.title ?? "",
    context: s?.context ?? "",
    challenge: s?.challenge ?? "",
    actions: s?.actions ?? "",
    outcome: s?.outcome ?? "",
    measurable_impact: s?.measurable_impact ?? "",
    lessons: s?.lessons ?? "",
    motivation: s?.motivation ?? "",
    skills: s?.skills ?? [],
    related_criteria: s?.related_criteria ?? [],
    supporting_evidence: s?.supporting_evidence ?? "",
    tags: s?.tags ?? [],
    period: s?.period ?? "",
    verification_status: s?.verification_status ?? "self_reported",
  };
}

export function StoryForm({ story }: { story: Story | null }) {
  const router = useRouter();
  const form = useForm<StoryInput>({ resolver: zodResolver(storySchema), defaultValues: storyDefaults(story) });
  const { errors, isSubmitting, isDirty } = form.formState;
  const area = (name: keyof StoryInput, label: string, hint: string, rows = 3) => (
    <Field id={`st-${name}`} label={label} hint={hint} error={errors[name]?.message as string | undefined}>
      <Textarea id={`st-${name}`} rows={rows} {...form.register(name)} />
    </Field>
  );
  const list = (name: "skills" | "related_criteria" | "tags", label: string, placeholder: string) => (
    <Field id={`st-${name}`} label={label}>
      <Controller control={form.control} name={name} render={({ field }) => <ListInput id={`st-${name}`} value={field.value} onChange={field.onChange} placeholder={placeholder} />} />
    </Field>
  );

  return (
    <form
      noValidate
      className="space-y-8"
      onSubmit={form.handleSubmit(async (v) => {
        const res = handleResult(await saveStory(story?.id ?? null, v), "Story saved");
        if (!res) return;
        form.reset(v);
        if (!story) router.replace(`/stories/${res.id}`);
        else router.refresh();
      })}
    >
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-[1fr_12rem_14rem]">
        <Field id="st-title" label="Story title" importance="critical" error={errors.title?.message}>
          <Input id="st-title" placeholder="e.g. Founding a community coding club" {...form.register("title")} aria-invalid={Boolean(errors.title)} />
        </Field>
        <Field id="st-period" label="Date or period">
          <Input id="st-period" placeholder="e.g. 2022–2024" {...form.register("period")} />
        </Field>
        <Field id="st-verification" label="Verification status">
          <Controller
            control={form.control}
            name="verification_status"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id="st-verification" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STORY_VERIFICATION.map((s) => (
                    <SelectItem key={s} value={s}>
                      {STORY_VERIFICATION_LABELS[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </Field>
      </div>

      <fieldset className="space-y-5">
        <legend className="mb-1 text-sm font-semibold">The story</legend>
        <p className="-mt-3 text-xs text-muted-foreground">A STAR-style structure helps, but fill in only what fits this experience.</p>
        {area("context", "Context", "Where and when. What was the situation?")}
        {area("challenge", "Challenge or opportunity", "What problem or opening did you face?")}
        {area("actions", "Your actions", "What did you personally do? Separate your contribution from the team's.", 4)}
        {area("outcome", "Outcome", "What happened as a result?")}
        {area("measurable_impact", "Measurable impact", "Only figures you can verify. Leave blank rather than estimate.", 2)}
        {area("lessons", "Lessons learned", "What did you learn, and how did it change you?")}
        {area("motivation", "Personal motivation", "Why did this matter to you?", 2)}
      </fieldset>

      <fieldset className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <legend className="mb-3 text-sm font-semibold">Connections</legend>
        {list("skills", "Relevant skills", "e.g. Negotiation")}
        {list("related_criteria", "Related selection criteria", "e.g. Leadership and influencing")}
        {list("tags", "Tags", "e.g. leadership")}
        {area("supporting_evidence", "Supporting evidence", "Documents, links or people who can confirm it.", 2)}
      </fieldset>

      <div className="sticky bottom-0 -mx-4 flex items-center gap-2 border-t bg-background/95 px-4 py-3 backdrop-blur sm:mx-0 sm:px-0">
        <Button type="submit" disabled={isSubmitting || (!!story && !isDirty)}>
          {isSubmitting && <Loader2 className="animate-spin" />} {story ? "Save changes" : "Save story"}
        </Button>
        {story && isDirty && <span className="text-xs text-muted-foreground">Unsaved changes</span>}
      </div>
    </form>
  );
}
