"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, Check, Plus, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Pill } from "@/components/badges";
import type { Outline } from "@/lib/ai/schemas";
import { saveOutline } from "@/server/essays";
import { handleResult } from "@/lib/client/result";

type Section = Outline["sections"][number];

const emptySection = (): Section => ({ heading: "", purpose: "", key_points: [], evidence_refs: [], word_allocation: 100, requirements_addressed: [] });

/** Editable outline. Approving it is required before a draft can be generated. */
export function OutlineEditor({ essayId, initial, approved, maxWords, onSaved }: { essayId: string; initial: Outline; approved: boolean; maxWords: number | null; onSaved: () => void }) {
  const [outline, setOutline] = useState<Outline>(initial);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const total = outline.sections.reduce((a, s) => a + (Number(s.word_allocation) || 0), 0);

  const update = (fn: (o: Outline) => Outline) => {
    setOutline((o) => fn(o));
    setDirty(true);
  };
  const setSection = (i: number, patch: Partial<Section>) => update((o) => ({ ...o, sections: o.sections.map((s, j) => (j === i ? { ...s, ...patch } : s)) }));
  const move = (i: number, d: -1 | 1) =>
    update((o) => {
      const next = [...o.sections];
      const [s] = next.splice(i, 1);
      next.splice(i + d, 0, s);
      return { ...o, sections: next };
    });

  const save = async (approve: boolean) => {
    setBusy(true);
    const clean: Outline = {
      ...outline,
      sections: outline.sections
        .filter((s) => s.heading.trim() || s.purpose.trim() || s.key_points.length)
        .map((s) => ({ ...s, word_allocation: Math.max(0, Math.round(Number(s.word_allocation) || 0)), key_points: s.key_points.map((k) => k.trim()).filter(Boolean) })),
    };
    const ok = handleResult(await saveOutline(essayId, clean, approve), approve ? "Outline approved" : "Outline saved");
    setBusy(false);
    if (ok !== null) {
      setDirty(false);
      onSaved();
    }
  };

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label htmlFor="ol-thesis" className="text-xs">
          Thesis or central argument
        </Label>
        <Textarea id="ol-thesis" rows={3} className="font-serif text-sm" value={outline.thesis} onChange={(e) => update((o) => ({ ...o, thesis: e.target.value }))} />
      </div>
      <ol className="space-y-2">
        {outline.sections.map((s, i) => (
          <li key={i} className="space-y-2 rounded-lg border bg-card p-2.5">
            <div className="flex items-center gap-1">
              <span className="text-xs text-muted-foreground tabular-nums">{i + 1}.</span>
              <Input aria-label={`Section ${i + 1} heading`} value={s.heading} onChange={(e) => setSection(i, { heading: e.target.value })} className="h-7 text-sm font-medium" placeholder="Section heading" />
              <Input
                aria-label={`Section ${i + 1} word allocation`}
                type="number"
                inputMode="numeric"
                value={s.word_allocation}
                onChange={(e) => setSection(i, { word_allocation: Number(e.target.value) })}
                className="h-7 w-20 text-right text-xs"
              />
              <Button variant="ghost" size="icon-xs" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}>
                <ArrowUp />
              </Button>
              <Button variant="ghost" size="icon-xs" aria-label="Move down" disabled={i === outline.sections.length - 1} onClick={() => move(i, 1)}>
                <ArrowDown />
              </Button>
              <Button variant="ghost" size="icon-xs" aria-label={`Remove section ${i + 1}`} onClick={() => update((o) => ({ ...o, sections: o.sections.filter((_, j) => j !== i) }))}>
                <Trash2 />
              </Button>
            </div>
            <Input aria-label={`Section ${i + 1} purpose`} value={s.purpose} onChange={(e) => setSection(i, { purpose: e.target.value })} className="h-7 text-xs" placeholder="Purpose of this section" />
            <Textarea
              aria-label={`Section ${i + 1} key points`}
              rows={Math.max(2, s.key_points.length)}
              value={s.key_points.join("\n")}
              onChange={(e) => setSection(i, { key_points: e.target.value.split("\n") })}
              className="text-xs"
              placeholder="Key points, one per line"
            />
            {(s.evidence_refs.length > 0 || s.requirements_addressed.length > 0) && (
              <div className="flex flex-wrap gap-1">
                {s.evidence_refs.map((r) => (
                  <Pill key={r} className="text-[0.65rem]">
                    {r}
                  </Pill>
                ))}
                {s.requirements_addressed.map((r) => (
                  <Pill key={r} tone="bg-accent text-accent-foreground ring-transparent" className="text-[0.65rem]">
                    {r}
                  </Pill>
                ))}
              </div>
            )}
          </li>
        ))}
      </ol>
      <div className="flex items-center justify-between text-xs">
        <Button variant="ghost" size="xs" onClick={() => update((o) => ({ ...o, sections: [...o.sections, emptySection()] }))}>
          <Plus /> Add section
        </Button>
        <span className={maxWords && total > maxWords ? "font-medium text-destructive" : "text-muted-foreground"}>
          Allocated {total}
          {maxWords ? ` of ${maxWords}` : ""} words
        </span>
      </div>
      {outline.gaps.length > 0 && (
        <div className="rounded-md border border-dashed p-2 text-xs">
          <div className="font-medium">Still missing</div>
          <ul className="mt-1 list-disc pl-4 text-muted-foreground">
            {outline.gaps.map((g, i) => (
              <li key={i}>{g}</li>
            ))}
          </ul>
        </div>
      )}
      {outline.notes && <p className="text-xs text-muted-foreground">{outline.notes}</p>}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" disabled={busy || !dirty} onClick={() => void save(false)}>
          <Save /> Save edits
        </Button>
        <Button size="sm" disabled={busy || (approved && !dirty)} onClick={() => void save(true)}>
          <Check /> {approved && !dirty ? "Approved" : "Approve outline"}
        </Button>
      </div>
    </div>
  );
}
