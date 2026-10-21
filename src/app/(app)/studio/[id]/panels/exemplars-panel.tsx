"use client";

import { useState } from "react";
import Link from "next/link";
import { LibraryBig, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { EXEMPLAR_ASPECTS, EXEMPLAR_ASPECT_LABELS, type ExemplarAspect } from "@/lib/domain/constants";
import type { Blueprint } from "@/lib/ai/schemas";
import { removeSelectedLesson, setEssayExemplarSettings } from "@/server/exemplars";
import { handleResult } from "@/lib/client/result";
import type { EditorApi, WorkspaceData } from "../types";
import { useEssayAi } from "../use-ai";
import { AiNotice, BusyBar } from "./ai-bits";

export function ExemplarsPanel({ data, api }: { data: WorkspaceData; api: EditorApi }) {
  const ai = useEssayAi(data.essay.id);
  const [enabled, setEnabled] = useState(data.essay.use_exemplars);
  const [aspects, setAspects] = useState<ExemplarAspect[]>(data.essay.exemplar_aspects);
  const [blueprint, setBlueprint] = useState<Blueprint | null>(data.essay.blueprint);

  const save = async (nextEnabled: boolean, nextAspects: ExemplarAspect[]) => {
    const prev = { enabled, aspects };
    setEnabled(nextEnabled);
    setAspects(nextAspects);
    if (handleResult(await setEssayExemplarSettings(data.essay.id, nextEnabled, nextAspects)) === null) {
      setEnabled(prev.enabled);
      setAspects(prev.aspects);
    } else api.refresh();
  };

  const makeBlueprint = async () => {
    const res = await ai.run<{ blueprint: Blueprint }>("Building your blueprint", { op: "blueprint" });
    if (res?.ok) setBlueprint(res.data.blueprint);
  };

  return (
    <div className="space-y-5">
      <p className="text-xs text-muted-foreground">
        Exemplars are learning references. Only the lessons you select below — summaries of techniques, never the exemplar&apos;s wording or experiences — are used when outlining and drafting.
      </p>

      <div className="flex items-center justify-between gap-3 rounded-lg border bg-card p-3">
        <Label htmlFor="use-exemplars" className="text-sm">
          Use exemplar guidance for this essay
        </Label>
        <Switch id="use-exemplars" checked={enabled} onCheckedChange={(v) => void save(v, aspects)} />
      </div>

      {enabled && (
        <fieldset className="space-y-2">
          <legend className="text-xs font-medium">Apply the exemplars&apos;…</legend>
          <div className="grid grid-cols-2 gap-1.5">
            {EXEMPLAR_ASPECTS.map((a) => (
              <div key={a} className="flex items-center gap-2">
                <Checkbox id={`asp-${a}`} checked={aspects.includes(a)} onCheckedChange={(v) => void save(enabled, v === true ? [...aspects, a] : aspects.filter((x) => x !== a))} />
                <Label htmlFor={`asp-${a}`} className="text-xs font-normal">
                  {EXEMPLAR_ASPECT_LABELS[a]}
                </Label>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">Transferable lessons you selected always apply while guidance is on.</p>
        </fieldset>
      )}

      <section aria-labelledby="sel-lessons">
        <h3 id="sel-lessons" className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Selected lessons ({data.lessons.length})
        </h3>
        {data.lessons.length === 0 ? (
          <p className="mt-1 text-xs text-muted-foreground">None yet. Open an analysed exemplar and choose lessons for this essay.</p>
        ) : (
          <ul className="mt-1 space-y-1.5">
            {data.lessons.map((l) => (
              <li key={l.id} className="flex items-start gap-1.5 rounded-md border bg-card p-2 text-xs">
                <div className="min-w-0 flex-1">
                  <span className="font-medium capitalize">{l.aspect === "lesson" ? "Lesson" : EXEMPLAR_ASPECT_LABELS[l.aspect]}</span>
                  <span className="text-muted-foreground"> · {data.exemplarTitles[l.exemplar_id] ?? "Exemplar"}</span>
                  <p className="mt-0.5">{l.content}</p>
                </div>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label="Remove lesson"
                  onClick={async () => {
                    if (handleResult(await removeSelectedLesson(l.id)) !== null) api.refresh();
                  }}
                >
                  <X />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="att-ex">
        <h3 id="att-ex" className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Writing references for this application
        </h3>
        {data.exemplars.length === 0 ? (
          <p className="mt-1 text-xs text-muted-foreground">No exemplars attached to this application.</p>
        ) : (
          <ul className="mt-1 space-y-1 text-sm">
            {data.exemplars.map((x) => (
              <li key={x.id} className="flex items-center justify-between gap-2">
                <Link href={`/exemplars/${x.id}`} className="truncate hover:underline">
                  {x.title}
                </Link>
                <span className="shrink-0 text-xs text-muted-foreground">{x.analysed ? "Choose lessons →" : "Not analysed"}</span>
              </li>
            ))}
          </ul>
        )}
        <Button asChild variant="outline" size="sm" className="mt-2">
          <Link href="/exemplars">
            <LibraryBig /> Add writing reference
          </Link>
        </Button>
      </section>

      <section aria-labelledby="bp-h" className="space-y-2">
        <h3 id="bp-h" className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Personalised blueprint
        </h3>
        <BusyBar label={ai.busy} onCancel={ai.cancel} />
        {blueprint && (
          <div className="space-y-2 rounded-lg border bg-card p-3 text-xs">
            <p>
              <span className="font-medium">Opening:</span> {blueprint.opening_strategy}
            </p>
            <ol className="list-decimal space-y-0.5 pl-4">
              {blueprint.structure.map((s, i) => (
                <li key={i}>
                  <span className="font-medium">{s.section}</span> (~{s.word_allocation} words) — <span className="text-muted-foreground">{s.purpose}</span>
                </li>
              ))}
            </ol>
            {blueprint.questions_to_answer.length > 0 && (
              <div>
                <div className="font-medium">Questions to answer</div>
                <ul className="list-disc pl-4 text-muted-foreground">
                  {blueprint.questions_to_answer.map((q, i) => (
                    <li key={i}>{q}</li>
                  ))}
                </ul>
              </div>
            )}
            <p className="text-muted-foreground">{blueprint.balance_guidance}</p>
            {blueprint.weaknesses_to_avoid.length > 0 && <p>Avoid: {blueprint.weaknesses_to_avoid.join("; ")}</p>}
          </div>
        )}
        <Button size="sm" variant={blueprint ? "ghost" : "outline"} onClick={() => void makeBlueprint()} disabled={!api.aiAvailable || ai.busy !== null || data.lessons.length === 0}>
          <Sparkles /> {blueprint ? "Rebuild blueprint" : "Build blueprint from lessons"}
        </Button>
        <p className="text-xs text-muted-foreground">The blueprint adapts your selected lessons to this exact prompt and word limit; it is used for the outline when guidance is on.</p>
      </section>
      <AiNotice />
    </div>
  );
}
