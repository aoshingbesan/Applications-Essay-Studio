"use client";

import { useEffect, useState } from "react";
import { Loader2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ConfirmAction } from "@/components/confirm-action";
import { DiffView, diffStats } from "@/components/diff-view";
import { getVersion, restoreVersion } from "@/server/essays";
import { handleResult } from "@/lib/client/result";
import { formatDateTime } from "@/lib/format/date";
import type { EssayVersion, VersionSource } from "@/lib/domain/types";
import type { EditorApi, VersionSummary } from "../types";

export const SOURCE_LABELS: Record<VersionSource, string> = {
  manual: "Saved",
  ai_draft: "AI draft",
  ai_revision: "AI edit",
  restore: "Restored",
  pre_restore: "Backup",
  pre_ai: "Backup",
  duplicate: "Copy",
};

/** Read-only preview of a saved version, with a diff against the current draft and restore. */
export function VersionDialog({ api, version, onClose }: { api: EditorApi; version: VersionSummary | null; onClose: () => void }) {
  const [full, setFull] = useState<EssayVersion | null>(null);
  const [mode, setMode] = useState<"read" | "diff">("diff");

  useEffect(() => {
    if (!version) return;
    let cancelled = false;
    void getVersion(api.essayId, version.id).then((res) => {
      if (cancelled) return;
      const v = handleResult(res);
      setFull(v);
    });
    return () => {
      cancelled = true;
      setFull(null);
    };
  }, [api.essayId, version]);

  const current = version ? api.getText() : "";
  const stats = full ? diffStats(full.plain_text, current) : null;

  return (
    <Dialog open={version !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            v{version?.version_number} · {version?.title}
          </DialogTitle>
          <DialogDescription>
            {version && `${SOURCE_LABELS[version.source]} · ${formatDateTime(version.created_at)} · ${version.word_count} words`}
            {version?.change_summary ? ` · ${version.change_summary}` : ""}
          </DialogDescription>
        </DialogHeader>
        <Tabs value={mode} onValueChange={(v) => setMode(v as typeof mode)}>
          <TabsList>
            <TabsTrigger value="diff">Changes since this version</TabsTrigger>
            <TabsTrigger value="read">Read version</TabsTrigger>
          </TabsList>
        </Tabs>
        {!full ? (
          <div className="flex justify-center py-10">
            <Loader2 className="size-5 animate-spin text-muted-foreground" aria-label="Loading" />
          </div>
        ) : mode === "diff" ? (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              From this version to your current draft: {stats?.added} words added, {stats?.removed} removed.
            </p>
            <div className="rounded-lg border bg-paper p-5">
              <DiffView before={full.plain_text} after={current} />
            </div>
          </div>
        ) : (
          <div className="rounded-lg border bg-paper p-5 font-serif text-[0.95rem] leading-relaxed whitespace-pre-wrap">{full.plain_text || "(empty)"}</div>
        )}
        <DialogFooter>
          <ConfirmAction
            trigger={
              <Button disabled={!full}>
                <RotateCcw /> Restore this version
              </Button>
            }
            title={`Restore “${version?.title}”?`}
            description="Your current draft is saved as a backup version first, so you can return to it."
            confirmLabel="Restore"
            destructive={false}
            onConfirm={async () => {
              if (!version) return false;
              await api.flush();
              const res = handleResult(await restoreVersion(api.essayId, version.id, api.revision()), `Restored v${version.version_number}`);
              if (!res) return false;
              api.replaceAll(res.content, res.revision);
              onClose();
            }}
          />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
