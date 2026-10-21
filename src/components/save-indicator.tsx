"use client";

import { AlertCircle, Check, Loader2 } from "lucide-react";
import type { SaveState } from "@/hooks/use-autosave";
import { Button } from "@/components/ui/button";

export function SaveIndicator({ state, lastSavedAt, onRetry }: { state: SaveState; lastSavedAt: Date | null; onRetry?: () => void }) {
  const time = lastSavedAt?.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return (
    <div role="status" aria-live="polite" className="flex items-center gap-1.5 text-xs text-muted-foreground">
      {state === "saving" && (
        <>
          <Loader2 className="size-3.5 animate-spin" aria-hidden /> Saving…
        </>
      )}
      {state === "pending" && <>Unsaved changes</>}
      {state === "saved" && (
        <>
          <Check className="size-3.5 text-success" aria-hidden /> Saved {time}
        </>
      )}
      {state === "idle" && lastSavedAt && <>Saved {time}</>}
      {state === "idle" && !lastSavedAt && <>All changes saved</>}
      {state === "error" && (
        <>
          <AlertCircle className="size-3.5 text-destructive" aria-hidden />
          <span className="text-destructive">Not saved</span>
          {onRetry && (
            <Button type="button" size="xs" variant="outline" onClick={onRetry}>
              Retry
            </Button>
          )}
        </>
      )}
    </div>
  );
}
