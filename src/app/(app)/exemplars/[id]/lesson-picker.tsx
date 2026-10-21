"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { SelectableLesson } from "@/lib/exemplars/lessons";
import { setExemplarLink, setLessonSelected } from "@/server/exemplars";
import { handleResult } from "@/lib/client/result";

/** Selects which techniques from this analysis to apply in one of the user's essays. */
export function LessonPicker({
  exemplarId,
  analysisId,
  lessons,
  essays,
  selected,
}: {
  exemplarId: string;
  analysisId: string;
  lessons: SelectableLesson[];
  essays: { id: string; label: string; applicationId: string }[];
  selected: { essayId: string; key: string }[];
}) {
  const router = useRouter();
  const [essayId, setEssayId] = useState(essays[0]?.id ?? "");
  const [chosen, setChosen] = useState(() => new Set(selected.map((s) => `${s.essayId}|${s.key}`)));
  const aspects = lessons.filter((l) => l.aspect !== "lesson");
  const general = lessons.filter((l) => l.aspect === "lesson");

  const mark = (key: string, on: boolean) =>
    setChosen((s) => {
      const n = new Set(s);
      if (on) n.add(key);
      else n.delete(key);
      return n;
    });

  const toggle = async (l: SelectableLesson, on: boolean) => {
    const essay = essays.find((e) => e.id === essayId);
    if (!essay) return;
    const k = `${essayId}|${l.key}`;
    // Optimistic: reflect the choice immediately and undo it if saving fails.
    mark(k, on);
    const res = await setLessonSelected({ essayId, exemplarId, analysisId, aspect: l.aspect, lessonKey: l.key, content: l.content }, on);
    if (handleResult(res) === null) {
      mark(k, !on);
      return;
    }
    // Using a lesson in an essay attaches the exemplar to that essay's application.
    if (on) await setExemplarLink(exemplarId, essay.applicationId, true);
    router.refresh();
  };

  const row = (l: SelectableLesson) => {
    const id = `lesson-${l.key.replace(/[^a-z0-9]/gi, "-")}`;
    return (
      <li key={l.key} className="flex items-start gap-2.5">
        <Checkbox id={id} className="mt-0.5" disabled={!essayId} checked={chosen.has(`${essayId}|${l.key}`)} onCheckedChange={(v) => void toggle(l, v === true)} />
        <Label htmlFor={id} className="text-sm leading-snug font-normal">
          {l.aspect === "lesson" ? l.title : <span className="font-medium">{l.title}</span>}
        </Label>
      </li>
    );
  };

  return (
    <section aria-labelledby="lessons-h" className="rounded-xl border bg-card p-4">
      <h2 id="lessons-h" className="text-sm font-semibold">
        Use in an essay
      </h2>
      <p className="mt-1 text-xs text-muted-foreground">Choose the techniques to apply. Only these summaries — never the exemplar&apos;s text — are used when drafting.</p>
      {essays.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">
          Create an application with an essay first.{" "}
          <Link href="/applications/new" className="text-ink hover:underline">
            Create application
          </Link>
        </p>
      ) : (
        <div className="mt-3 space-y-4">
          <Select value={essayId} onValueChange={setEssayId}>
            <SelectTrigger className="w-full" aria-label="Essay to apply lessons to">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {essays.map((e) => (
                <SelectItem key={e.id} value={e.id}>
                  {e.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div>
            <h3 className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">Approach</h3>
            <ul className="space-y-2">{aspects.map(row)}</ul>
          </div>
          <div>
            <h3 className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">Transferable lessons</h3>
            <ul className="space-y-2">{general.map(row)}</ul>
          </div>
          {essayId && (
            <Link href={`/studio/${essayId}`} className="inline-block text-sm text-ink hover:underline">
              Open this essay in the Studio →
            </Link>
          )}
        </div>
      )}
    </section>
  );
}
