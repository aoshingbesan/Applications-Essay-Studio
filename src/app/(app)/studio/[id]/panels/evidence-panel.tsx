"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { ClassificationBadge, Pill, VerificationBadge } from "@/components/badges";
import { EVIDENCE_SECTION_LABELS } from "@/lib/domain/constants";
import { setEssayEvidenceLink } from "@/server/essays";
import { handleResult } from "@/lib/client/result";
import type { EditorApi, WorkspaceData } from "../types";
import { useEssayAi } from "../use-ai";
import { AiNotice, BusyBar } from "./ai-bits";

type Target = { type: "story" | "evidence" | "document"; id: string };
interface Recommendation {
  recommendations: { target: Target; reason: string; use_for: string; strength: "strong" | "moderate" | "weak" }[];
  notRecommended: { target: Target; reason: string }[];
  conflicts: { description: string }[];
  missing: string[];
}

export function EvidencePanel({ data, api }: { data: WorkspaceData; api: EditorApi }) {
  const ai = useEssayAi(data.essay.id);
  const [linked, setLinked] = useState(() => new Set(data.links.map((l) => `${l.story_id ? "story" : l.evidence_id ? "evidence" : "document"}:${l.story_id ?? l.evidence_id ?? l.document_id}`)));
  const [rec, setRec] = useState<Recommendation | null>(null);

  const isLinked = (t: Target) => linked.has(`${t.type}:${t.id}`);
  const toggle = async (t: Target, on: boolean) => {
    if (handleResult(await setEssayEvidenceLink(data.essay.id, t, on)) === null) return;
    setLinked((s) => {
      const n = new Set(s);
      if (on) n.add(`${t.type}:${t.id}`);
      else n.delete(`${t.type}:${t.id}`);
      return n;
    });
  };
  const nameOf = (t: Target) =>
    t.type === "story" ? data.stories.find((s) => s.id === t.id)?.title : t.type === "evidence" ? data.evidence.find((e) => e.id === t.id)?.title : data.documents.find((d) => d.id === t.id)?.title;

  const recommend = async () => {
    const res = await ai.run<Recommendation>("Finding relevant evidence", { op: "recommend_evidence" });
    if (res?.ok) setRec(res.data);
  };

  const row = (t: Target, label: React.ReactNode, meta: React.ReactNode) => {
    const id = `ev-${t.type}-${t.id}`;
    return (
      <li key={id} className="flex items-start gap-2.5 py-1.5">
        <Checkbox id={id} className="mt-0.5" checked={isLinked(t)} onCheckedChange={(v) => void toggle(t, v === true)} />
        <Label htmlFor={id} className="block min-w-0 flex-1 font-normal">
          <span className="block text-sm leading-snug">{label}</span>
          <span className="mt-0.5 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">{meta}</span>
        </Label>
      </li>
    );
  };

  return (
    <div className="space-y-5">
      <p className="text-xs text-muted-foreground">
        Select what this essay should draw on. If nothing is selected, the most relevant items are chosen automatically for each AI step. Fewer, well-developed examples usually make a stronger essay.
      </p>
      <BusyBar label={ai.busy} onCancel={ai.cancel} />
      <Button size="sm" variant="outline" onClick={() => void recommend()} disabled={!api.aiAvailable || ai.busy !== null || data.stories.length + data.evidence.length === 0}>
        <Sparkles /> Recommend evidence for this prompt
      </Button>

      {rec && (
        <section aria-label="Recommendations" className="space-y-2 rounded-lg border border-ink/30 bg-card p-3">
          <h3 className="text-sm font-semibold">Recommended</h3>
          {rec.recommendations.length === 0 && <p className="text-xs text-muted-foreground">No strong matches in your library for this prompt.</p>}
          <ul className="space-y-2">
            {rec.recommendations.map((r, i) => (
              <li key={i} className="rounded-md border p-2 text-xs">
                <div className="flex items-start gap-2">
                  <Checkbox id={`rec-${i}`} className="mt-0.5" checked={isLinked(r.target)} onCheckedChange={(v) => void toggle(r.target, v === true)} aria-label={`Use ${nameOf(r.target)}`} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-sm font-medium">{nameOf(r.target)}</span>
                      <Pill>{r.strength}</Pill>
                    </div>
                    <p className="mt-1 text-muted-foreground">{r.reason}</p>
                    <p className="mt-0.5">Use for: {r.use_for}</p>
                  </div>
                </div>
              </li>
            ))}
          </ul>
          {rec.notRecommended.length > 0 && (
            <details className="text-xs">
              <summary className="cursor-pointer text-muted-foreground">Not recommended ({rec.notRecommended.length})</summary>
              <ul className="mt-1 space-y-1">
                {rec.notRecommended.map((r, i) => (
                  <li key={i}>
                    <span className="font-medium">{nameOf(r.target)}</span> — <span className="text-muted-foreground">{r.reason}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
          {rec.conflicts.length > 0 && (
            <div className="rounded-md border border-warning/40 bg-warning/5 p-2 text-xs">
              <div className="font-medium">Conflicting information — resolve before drafting</div>
              <ul className="mt-1 list-disc pl-4">
                {rec.conflicts.map((c, i) => (
                  <li key={i}>{c.description}</li>
                ))}
              </ul>
            </div>
          )}
          {rec.missing.length > 0 && (
            <div className="text-xs">
              <div className="font-medium">Evidence the prompt needs that you have not recorded</div>
              <ul className="mt-1 list-disc pl-4 text-muted-foreground">
                {rec.missing.map((m, i) => (
                  <li key={i}>{m}</li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      <section aria-labelledby="ev-stories">
        <div className="flex items-center justify-between">
          <h3 id="ev-stories" className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Story Bank
          </h3>
          <Link href="/stories/new" className="inline-flex items-center gap-1 text-xs text-ink hover:underline">
            <Plus className="size-3" /> New story
          </Link>
        </div>
        {data.stories.length === 0 ? (
          <p className="mt-1 text-xs text-muted-foreground">No stories yet.</p>
        ) : (
          <ul className="divide-y">
            {data.stories.map((s) =>
              row(
                { type: "story", id: s.id },
                s.title,
                <>
                  <VerificationBadge value={s.verification} />
                  {s.tags.slice(0, 3).map((t) => (
                    <span key={t}>#{t}</span>
                  ))}
                </>,
              ),
            )}
          </ul>
        )}
      </section>

      <section aria-labelledby="ev-profile">
        <h3 id="ev-profile" className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Personal Profile
        </h3>
        {data.evidence.length === 0 ? (
          <p className="mt-1 text-xs text-muted-foreground">
            No profile entries.{" "}
            <Link href="/profile" className="text-ink hover:underline">
              Add some
            </Link>
          </p>
        ) : (
          <ul className="divide-y">
            {data.evidence.map((e) =>
              row(
                { type: "evidence", id: e.id },
                e.title,
                <>
                  <span>{EVIDENCE_SECTION_LABELS[e.section]}</span>
                  <ClassificationBadge value={e.classification} />
                </>,
              ),
            )}
          </ul>
        )}
      </section>

      <section aria-labelledby="ev-docs">
        <h3 id="ev-docs" className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Supporting documents
        </h3>
        {data.documents.filter((d) => d.extraction_status === "extracted").length === 0 ? (
          <p className="mt-1 text-xs text-muted-foreground">No documents with readable text.</p>
        ) : (
          <ul className="divide-y">
            {data.documents.filter((d) => d.extraction_status === "extracted").map((d) => row({ type: "document", id: d.id }, d.title, <span>Relevant excerpts only are used</span>))}
          </ul>
        )}
      </section>
      <AiNotice />
    </div>
  );
}
