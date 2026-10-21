"use client";

import { useState } from "react";
import Link from "next/link";
import { Lock, Plus, ShieldQuestion, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { ClassificationBadge, Pill, PrivacyBadge } from "@/components/badges";
import { ENTRY_SECTIONS, SECTION_BY_KEY } from "@/lib/library/sections";
import { setEssayEvidenceLink } from "@/server/essays";
import { handleResult } from "@/lib/client/result";
import type { EditorApi, WorkspaceData } from "../types";
import { useEssayAi } from "../use-ai";
import { AiNotice, BusyBar } from "./ai-bits";

type Target = { type: "entry" | "document"; id: string };
type Entry = WorkspaceData["entries"][number];
interface Recommendation {
  recommendations: { target: Target; reason: string; use_for: string; strength: "strong" | "moderate" | "weak" }[];
  notRecommended: { target: Target; reason: string }[];
  conflicts: { description: string }[];
  missing: string[];
}

const key = (t: Target) => `${t.type}:${t.id}`;

export function EvidencePanel({ data, api }: { data: WorkspaceData; api: EditorApi }) {
  const ai = useEssayAi(data.essay.id);
  const [linked, setLinked] = useState(() => new Set(data.links.map((l) => (l.entry_id ? `entry:${l.entry_id}` : `document:${l.document_id}`))));
  const [rec, setRec] = useState<Recommendation | null>(null);

  const isLinked = (t: Target) => linked.has(key(t));
  const toggle = async (t: Target, on: boolean) => {
    if (handleResult(await setEssayEvidenceLink(data.essay.id, t, on)) === null) return;
    setLinked((s) => {
      const n = new Set(s);
      if (on) n.add(key(t));
      else n.delete(key(t));
      return n;
    });
  };
  const entryOf = (id: string) => data.entries.find((e) => e.id === id);
  const nameOf = (t: Target) => (t.type === "entry" ? entryOf(t.id)?.title : data.documents.find((d) => d.id === t.id)?.title);
  const pending = data.pendingApprovals.map(entryOf).filter((e): e is Entry => Boolean(e) && !isLinked({ type: "entry", id: e!.id }));

  const recommend = async () => {
    const res = await ai.run<Recommendation>("Finding relevant evidence", { op: "recommend_evidence" });
    if (res?.ok) setRec(res.data);
  };

  const entryRow = (e: Entry) => {
    const t: Target = { type: "entry", id: e.id };
    const id = `ev-${e.id}`;
    const isPrivate = e.privacy === "private";
    return (
      <li key={e.id} className="flex items-start gap-2.5 py-1.5">
        {isPrivate ? (
          <Lock className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
        ) : (
          <Checkbox id={id} className="mt-0.5" checked={isLinked(t)} onCheckedChange={(v) => void toggle(t, v === true)} aria-describedby={e.privacy === "ask" ? `${id}-ask` : undefined} />
        )}
        <Label htmlFor={isPrivate ? undefined : id} className="block min-w-0 flex-1 font-normal">
          <span className={isPrivate ? "block text-sm leading-snug text-muted-foreground" : "block text-sm leading-snug"}>{e.title}</span>
          <span className="mt-0.5 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
            <ClassificationBadge value={e.classification} />
            {e.privacy !== "available" && <PrivacyBadge value={e.privacy} />}
            {e.privacy === "ask" && (
              <span id={`${id}-ask`}>{isLinked(t) ? "Approved for this essay" : "Tick to approve for this essay"}</span>
            )}
            {isPrivate && (
              <Link href={`/library/entry/${e.id}`} className="text-ink hover:underline">
                Private — never sent. Change in Story Bank
              </Link>
            )}
          </span>
        </Label>
      </li>
    );
  };

  return (
    <div className="space-y-5">
      <p className="text-xs text-muted-foreground">
        Choose what this essay should draw on. With nothing ticked, the most relevant <strong>Available</strong> entries are used automatically. Ask-first entries are used only once you approve them here; Private entries never are.
      </p>

      {pending.length > 0 && (
        <section aria-labelledby="pending-h" className="space-y-2 rounded-lg border border-warning/40 bg-warning/5 p-3">
          <h3 id="pending-h" className="flex items-center gap-1.5 text-sm font-semibold">
            <ShieldQuestion className="size-4" aria-hidden /> May be relevant — needs your approval
          </h3>
          <p className="text-xs text-muted-foreground">These Ask-first entries match this prompt. Nothing about them has been sent to the AI. Approve one to use it in this essay only.</p>
          <ul className="space-y-1.5">
            {pending.map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-2 text-sm">
                <span className="min-w-0 truncate">{e.title}</span>
                <Button size="xs" variant="outline" onClick={() => void toggle({ type: "entry", id: e.id }, true)}>
                  Approve for this essay
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <BusyBar label={ai.busy} onCancel={ai.cancel} />
      <Button size="sm" variant="outline" onClick={() => void recommend()} disabled={!api.aiAvailable || ai.busy !== null || !data.entries.some((e) => e.privacy === "available")}>
        <Sparkles /> Recommend evidence for this prompt
      </Button>

      {rec && (
        <section aria-label="Recommendations" className="space-y-2 rounded-lg border border-ink/30 bg-card p-3">
          <h3 className="text-sm font-semibold">Recommended</h3>
          <p className="text-xs text-muted-foreground">Chosen from your Available entries (and any you approved). Ask-first and Private entries were not sent.</p>
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

      {data.entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Your Story Bank is empty.{" "}
          <Link href="/library" className="text-ink hover:underline">
            Add entries
          </Link>{" "}
          to give your essays real material.
        </p>
      ) : (
        ENTRY_SECTIONS.filter((s) => data.entries.some((e) => e.section === s)).map((s) => (
          <section key={s} aria-labelledby={`evs-${s}`}>
            <h3 id={`evs-${s}`} className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              {SECTION_BY_KEY[s].title}
            </h3>
            <ul className="divide-y">{data.entries.filter((e) => e.section === s).map(entryRow)}</ul>
          </section>
        ))
      )}
      <Link href="/library/entry/new" className="inline-flex items-center gap-1 text-xs text-ink hover:underline">
        <Plus className="size-3" /> New Story Bank entry
      </Link>

      <section aria-labelledby="ev-docs">
        <h3 id="ev-docs" className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Supporting documents
        </h3>
        {data.documents.filter((d) => d.extraction_status === "extracted").length === 0 ? (
          <p className="mt-1 text-xs text-muted-foreground">No documents with readable text.</p>
        ) : (
          <ul className="divide-y">
            {data.documents
              .filter((d) => d.extraction_status === "extracted")
              .map((d) => {
                const t: Target = { type: "document", id: d.id };
                return (
                  <li key={d.id} className="flex items-start gap-2.5 py-1.5">
                    <Checkbox id={`doc-${d.id}`} className="mt-0.5" checked={isLinked(t)} onCheckedChange={(v) => void toggle(t, v === true)} />
                    <Label htmlFor={`doc-${d.id}`} className="block font-normal">
                      <span className="block text-sm">{d.title}</span>
                      <span className="text-xs text-muted-foreground">Relevant excerpts only are used</span>
                    </Label>
                  </li>
                );
              })}
          </ul>
        )}
      </section>
      <AiNotice />
    </div>
  );
}
