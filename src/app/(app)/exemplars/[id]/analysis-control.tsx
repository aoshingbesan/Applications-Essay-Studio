"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { AnalysisBadge, type AnalysisDisplay } from "@/components/badges";
import { ConfirmAction } from "@/components/confirm-action";
import { postJson, toastApiError } from "@/lib/client/result";
import { formatDateTime } from "@/lib/format/date";

export function AnalysisControl({
  exemplarId,
  display,
  error,
  analysedAt,
  model,
  aiConfigured,
}: {
  exemplarId: string;
  display: AnalysisDisplay | "unavailable";
  error: string | null;
  analysedAt: string | null;
  model: string | null;
  aiConfigured: boolean;
}) {
  const router = useRouter();
  const [starting, setStarting] = useState(false);
  const [status, setStatus] = useState(display);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Poll while an analysis is running in the background.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- server state changed after refresh
    setStatus(display);
  }, [display]);

  useEffect(() => {
    if (status !== "queued" && status !== "running") return;
    let cancelled = false;
    const poll = async () => {
      try {
        const res = await fetch(`/api/exemplars/${exemplarId}/analyse`, { cache: "no-store" });
        const json = await res.json();
        const s = json?.analysis?.status as string | undefined;
        if (cancelled) return;
        if (s === "complete") {
          toast.success("Analysis complete");
          router.refresh();
          return;
        }
        if (s === "failed") {
          toast.error(json.analysis.error_message ?? "The analysis failed.");
          router.refresh();
          return;
        }
      } catch {
        // Network blip: keep polling.
      }
      if (!cancelled) timer.current = setTimeout(poll, 3000);
    };
    timer.current = setTimeout(poll, 2000);
    return () => {
      cancelled = true;
      if (timer.current) clearTimeout(timer.current);
    };
  }, [status, exemplarId, router]);

  const start = async (force: boolean) => {
    setStarting(true);
    const res = await postJson<{ status: string; cached?: boolean }>(`/api/exemplars/${exemplarId}/analyse`, { idempotencyKey: crypto.randomUUID(), force });
    setStarting(false);
    if (!res.ok) {
      toastApiError(res.error);
      return;
    }
    if (res.data.cached) {
      toast.info("This text has already been analysed — showing the saved report.");
      router.refresh();
      return;
    }
    setStatus("queued");
  };

  const busy = starting || status === "queued" || status === "running";

  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-card p-4 sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold">Analysis</span>
          {status !== "unavailable" && <AnalysisBadge value={status} />}
        </div>
        <p className="text-xs text-muted-foreground">
          {status === "unavailable"
            ? "Add readable essay text (at least 50 words) before analysing."
            : status === "queued" || status === "running"
              ? "Analysing the essay. This usually takes one to three minutes; you can leave this page."
              : status === "failed"
                ? (error ?? "The last analysis failed.")
                : status === "complete" && analysedAt
                  ? `Analysed ${formatDateTime(analysedAt)}${model ? ` with ${model}` : ""}. The text is sent to Anthropic's Claude API for analysis.`
                  : "The essay text is sent to Anthropic's Claude API for analysis. The report is saved and reused until the text changes."}
        </p>
      </div>
      {status !== "unavailable" &&
        (status === "complete" ? (
          <ConfirmAction
            trigger={
              <Button variant="outline" disabled={busy || !aiConfigured}>
                <RefreshCw /> Reanalyse
              </Button>
            }
            title="Reanalyse this exemplar?"
            description="A new report replaces the current one as the latest analysis. Lessons you already selected for essays are kept as they are."
            confirmLabel="Reanalyse"
            destructive={false}
            onConfirm={() => start(true)}
          />
        ) : (
          <Button onClick={() => void start(false)} disabled={busy || !aiConfigured} title={aiConfigured ? undefined : "AI is not configured on this server"}>
            {busy ? <Loader2 className="animate-spin" /> : <Sparkles />}
            {busy ? "Analysing…" : status === "stale" || status === "failed" ? "Analyse again" : "Analyse"}
          </Button>
        ))}
    </div>
  );
}
