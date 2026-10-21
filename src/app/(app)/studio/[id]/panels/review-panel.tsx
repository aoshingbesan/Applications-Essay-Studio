"use client";

import { useState } from "react";
import { CheckCircle2, ClipboardCheck, Crosshair, Eye, EyeOff, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { FindingBadge, Pill } from "@/components/badges";
import { setEssayStatus } from "@/server/applications";
import { runEssayChecks, setFindingDismissed } from "@/server/essays";
import { handleResult } from "@/lib/client/result";
import { withinLimits } from "@/lib/essay/word-limit";
import { countWords } from "@/lib/essay/doc";
import type { EssayStatus } from "@/lib/domain/constants";
import type { EssayReview, ReviewFinding } from "@/lib/domain/types";
import type { ReviewDimension } from "@/lib/ai/schemas";
import { cn } from "@/lib/utils";
import type { EditorApi, WorkspaceData } from "../types";
import { useEssayAi } from "../use-ai";
import { findAndSelect, focusBlock } from "../editor-utils";
import { AiNotice, BusyBar } from "./ai-bits";

const DIMENSION_LABELS: Record<ReviewDimension, string> = {
  prompt_alignment: "Prompt alignment",
  required_themes: "Required themes",
  selection_criteria: "Selection criteria",
  evidence_strength: "Strength of evidence",
  specificity: "Specificity",
  authenticity: "Authenticity",
  structure: "Logical structure",
  clarity: "Clarity",
  repetition: "Repetition",
  programme_fit: "Programme fit",
  feasibility: "Feasibility of goals",
  unsupported_claims: "Unsupported claims",
  word_count: "Word count",
  missing_requirements: "Missing requirements",
};

function FindingCard({ f, dismissed, onDismiss, api }: { f: ReviewFinding; dismissed: boolean; onDismiss: (d: boolean) => void; api: EditorApi }) {
  const locate = () => {
    if (f.excerpt && findAndSelect(api.editor, f.excerpt)) return;
    if (f.blockIndex !== undefined) focusBlock(api.editor, f.blockIndex);
    else toast.info("This finding is about something missing, not a specific passage.");
  };
  return (
    <li className={cn("rounded-lg border bg-card p-3 text-xs", dismissed && "opacity-55")}>
      <div className="flex flex-wrap items-center gap-1.5">
        <FindingBadge value={f.label} />
        <Pill tone={f.severity === "critical" ? "bg-red-50 text-red-800 ring-red-200 dark:bg-red-950 dark:text-red-200 dark:ring-red-900" : undefined}>{f.severity === "critical" ? "Critical" : "Optional"}</Pill>
        <span className="text-muted-foreground">{DIMENSION_LABELS[f.category as ReviewDimension] ?? f.category.replace(/_/g, " ")}</span>
      </div>
      <p className="mt-1.5 text-sm font-medium">{f.issue}</p>
      <p className="mt-1 text-muted-foreground">
        <span className="font-medium text-foreground">Why it matters: </span>
        {f.why}
      </p>
      {f.excerpt && <blockquote className="mt-1.5 border-l-2 pl-2 font-serif text-[0.8rem]">“{f.excerpt}”</blockquote>}
      {f.requirement && <p className="mt-1 text-muted-foreground">Requirement: {f.requirement}</p>}
      <p className="mt-1.5">→ {f.suggestion}</p>
      <div className="mt-2 flex gap-1">
        {(f.excerpt || f.blockIndex !== undefined) && (
          <Button size="xs" variant="ghost" onClick={locate}>
            <Crosshair /> Show in text
          </Button>
        )}
        <Button size="xs" variant="ghost" onClick={() => onDismiss(!dismissed)}>
          {dismissed ? <Eye /> : <EyeOff />} {dismissed ? "Restore" : "Dismiss"}
        </Button>
      </div>
    </li>
  );
}

function FindingList({ review, api, onChange }: { review: EssayReview; api: EditorApi; onChange: (r: EssayReview) => void }) {
  const [showDismissed, setShowDismissed] = useState(false);
  const dismissed = new Set(review.dismissed_ids);
  const sorted = [...review.findings].sort((a, b) => Number(b.severity === "critical") - Number(a.severity === "critical"));
  const visible = sorted.filter((f) => showDismissed || !dismissed.has(f.id));
  return (
    <div className="space-y-2">
      {visible.length === 0 ? (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <CheckCircle2 className="size-3.5 text-success" /> No open findings.
        </p>
      ) : (
        <ul className="space-y-2">
          {visible.map((f) => (
            <FindingCard
              key={f.id}
              f={f}
              api={api}
              dismissed={dismissed.has(f.id)}
              onDismiss={async (d) => {
                const res = handleResult(await setFindingDismissed(review.id, f.id, d));
                if (res) onChange({ ...review, dismissed_ids: res.dismissed_ids });
              }}
            />
          ))}
        </ul>
      )}
      {review.dismissed_ids.length > 0 && (
        <Button variant="link" size="sm" className="h-auto p-0 text-xs" onClick={() => setShowDismissed((s) => !s)}>
          {showDismissed ? "Hide dismissed" : `Show ${review.dismissed_ids.length} dismissed`}
        </Button>
      )}
    </div>
  );
}

export function ReviewPanel({ data, api, status, onStatus }: { data: WorkspaceData; api: EditorApi; status: EssayStatus; onStatus: (s: EssayStatus) => void }) {
  const { essay } = data;
  const ai = useEssayAi(essay.id);
  const [checks, setChecks] = useState<EssayReview | null>(data.checksReview);
  const [aiReview, setAiReview] = useState<EssayReview | null>(data.aiReview);
  const [running, setRunning] = useState(false);

  const runChecks = async () => {
    setRunning(true);
    try {
      if (!(await api.saveNow())) return;
      const res = handleResult(await runEssayChecks(essay.id));
      if (res) setChecks(res);
    } finally {
      setRunning(false);
    }
  };

  const runAiReview = async () => {
    if (!(await api.saveNow())) return;
    const text = api.getText();
    if (!text.trim()) {
      toast.error("The essay is empty.");
      return;
    }
    const res = await ai.run<{ reviewId: string; createdAt: string; findings: ReviewFinding[]; summary: string; dimensions: { dimension: ReviewDimension; label: ReviewFinding["label"]; comment: string }[] }>("Reviewing the draft", { op: "review", essayText: text });
    if (res?.ok) {
      setAiReview({
        id: res.data.reviewId,
        essay_id: essay.id,
        kind: "ai",
        job_id: res.data.jobId,
        essay_revision: api.revision(),
        word_count: countWords(text),
        findings: res.data.findings,
        summary: { summary: res.data.summary, dimensions: res.data.dimensions },
        dismissed_ids: [],
        created_at: res.data.createdAt,
      });
    }
  };

  const words = countWords(api.getText());
  const openCritical = [checks, aiReview].flatMap((r) => (r ? r.findings.filter((f) => f.severity === "critical" && !r.dismissed_ids.includes(f.id)) : []));
  const placeholders = /\[(?:ADD|CONFIRM)[^\]]*\]/.test(api.getText());
  const checksCurrent = checks && checks.essay_revision === api.revision();
  const checklist = [
    { ok: Boolean(essay.prompt.trim()), label: "Exact prompt recorded" },
    { ok: words > 0 && withinLimits(words, essay.min_words, essay.max_words), label: "Within the word limits" },
    { ok: !placeholders, label: "No [ADD]/[CONFIRM] placeholders left" },
    { ok: Boolean(checksCurrent), label: "Checks run on the latest text" },
    { ok: openCritical.length === 0, label: "No open critical findings" },
  ];
  const ready = checklist.every((c) => c.ok);
  const aiSummary = aiReview?.summary as { summary?: string; dimensions?: { dimension: ReviewDimension; label: ReviewFinding["label"]; comment: string }[] } | undefined;

  return (
    <div className="space-y-6">
      <p className="text-xs text-muted-foreground">
        Reviews compare your draft with the official requirements and your recorded evidence. They highlight things to check; they do not predict admission or award decisions.
      </p>

      <section className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">Requirement checks</h3>
          <Button size="sm" variant="outline" onClick={() => void runChecks()} disabled={running}>
            {running ? <Loader2 className="animate-spin" /> : <ClipboardCheck />} {checks ? "Run again" : "Run checks"}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">Instant and private (no AI): word limits, placeholders, required themes, criteria coverage, unsupported figures, generic phrasing, repetition and passages copied from exemplars.</p>
        {checks && (
          <>
            {!checksCurrent && <p className="text-xs text-warning">The draft has changed since these checks ran.</p>}
            <div className="flex flex-wrap gap-1.5 text-xs">
              <Pill>{(checks.summary as { words?: number }).words ?? checks.word_count} words</Pill>
              {(checks.summary as { themesTotal?: number }).themesTotal ? (
                <Pill>
                  Themes {(checks.summary as { themesCovered: number }).themesCovered}/{(checks.summary as { themesTotal: number }).themesTotal}
                </Pill>
              ) : null}
              {(checks.summary as { criteriaTotal?: number }).criteriaTotal ? (
                <Pill>
                  Criteria {(checks.summary as { criteriaCovered: number }).criteriaCovered}/{(checks.summary as { criteriaTotal: number }).criteriaTotal}
                </Pill>
              ) : null}
            </div>
            <FindingList review={checks} api={api} onChange={setChecks} />
          </>
        )}
      </section>

      <section className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">AI readiness review</h3>
          <Button size="sm" variant="outline" onClick={() => void runAiReview()} disabled={!api.aiAvailable || ai.busy !== null}>
            <Sparkles /> {aiReview ? "Review again" : "Review draft"}
          </Button>
        </div>
        <BusyBar label={ai.busy} onCancel={ai.cancel} />
        {aiReview && (
          <>
            {aiReview.essay_revision !== api.revision() && <p className="text-xs text-warning">The draft has changed since this review.</p>}
            {aiSummary?.summary && <p className="text-sm">{aiSummary.summary}</p>}
            {aiSummary?.dimensions && aiSummary.dimensions.length > 0 && (
              <ul className="grid grid-cols-1 gap-1 text-xs">
                {aiSummary.dimensions.map((d, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="w-36 shrink-0 font-medium">{DIMENSION_LABELS[d.dimension]}</span>
                    <FindingBadge value={d.label} />
                    <span className="sr-only">{d.comment}</span>
                  </li>
                ))}
              </ul>
            )}
            <FindingList review={aiReview} api={api} onChange={setAiReview} />
          </>
        )}
        <AiNotice />
      </section>

      <section className="space-y-2 rounded-lg border bg-card p-3">
        <h3 className="text-sm font-semibold">Final checklist</h3>
        <ul className="space-y-1 text-xs">
          {checklist.map((c) => (
            <li key={c.label} className="flex items-center gap-2">
              <span className={cn("grid size-4 place-items-center rounded-full text-[0.6rem]", c.ok ? "bg-success text-white" : "border")} aria-hidden>
                {c.ok ? "✓" : ""}
              </span>
              <span className={c.ok ? "" : "text-muted-foreground"}>{c.label}</span>
              <span className="sr-only">{c.ok ? "done" : "not done"}</span>
            </li>
          ))}
        </ul>
        <Button
          size="sm"
          disabled={status === "ready_to_submit" || status === "submitted"}
          variant={ready ? "default" : "outline"}
          onClick={async () => {
            if (!ready && !window.confirm("Some checklist items are not complete. Mark the essay Ready to Submit anyway?")) return;
            if (handleResult(await setEssayStatus(essay.id, "ready_to_submit"), "Marked Ready to Submit") !== null) {
              onStatus("ready_to_submit");
              api.refresh();
            }
          }}
        >
          <CheckCircle2 /> {status === "ready_to_submit" || status === "submitted" ? "Ready to Submit" : "Mark Ready to Submit"}
        </Button>
      </section>
    </div>
  );
}
