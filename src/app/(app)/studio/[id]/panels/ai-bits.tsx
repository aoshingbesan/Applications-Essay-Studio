"use client";

import { Info, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";

export function AiNotice() {
  return (
    <p className="flex items-start gap-1.5 text-[0.7rem] leading-snug text-muted-foreground">
      <Info className="mt-px size-3 shrink-0" aria-hidden />
      AI actions send the relevant requirements, selected evidence and text to Anthropic&apos;s Claude API. Results are suggestions: nothing replaces your text without your approval.
    </p>
  );
}

export function AiUnavailable({ reason }: { reason: string | null }) {
  if (!reason) return null;
  return <p className="rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">{reason}</p>;
}

export function BusyBar({ label, onCancel }: { label: string | null; onCancel: () => void }) {
  if (!label) return null;
  return (
    <div role="status" aria-live="polite" className="flex items-center gap-2 rounded-md border border-ink/30 bg-accent/40 px-3 py-2 text-xs">
      <Loader2 className="size-3.5 animate-spin" aria-hidden />
      <span className="flex-1">{label}… this can take up to a minute or two.</span>
      <Button size="xs" variant="ghost" onClick={onCancel}>
        <X /> Cancel
      </Button>
    </div>
  );
}

export function StepHeader({ n, title, done, children }: { n: number; title: string; done?: boolean; children?: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2.5">
      <span
        className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-full text-[0.65rem] font-semibold ${done ? "bg-ink text-ink-foreground" : "border text-muted-foreground"}`}
        aria-hidden
      >
        {n}
      </span>
      <div className="min-w-0 flex-1">
        <h3 className="text-sm font-semibold">{title}</h3>
        {children && <div className="mt-0.5 text-xs text-muted-foreground">{children}</div>}
      </div>
    </div>
  );
}
