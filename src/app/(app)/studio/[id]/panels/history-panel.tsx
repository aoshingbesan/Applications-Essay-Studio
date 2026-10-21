"use client";

import { useState } from "react";
import { Archive, ArchiveRestore, Copy, Eye, MoreHorizontal, Pencil } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { duplicateVersion, renameVersion, setVersionArchived } from "@/server/essays";
import { handleResult } from "@/lib/client/result";
import { formatDateTime } from "@/lib/format/date";
import type { EditorApi, VersionSummary } from "../types";
import { SOURCE_LABELS, VersionDialog } from "./version-dialog";

export function HistoryPanel({ api, versions }: { api: EditorApi; versions: VersionSummary[] }) {
  const [open, setOpen] = useState<VersionSummary | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const shown = versions.filter((v) => showArchived || !v.archived_at);

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">Autosave keeps the current draft. Saved versions are never overwritten; restoring backs up the current text first.</p>
      {shown.length === 0 ? (
        <p className="py-2 text-sm text-muted-foreground">No saved versions yet.</p>
      ) : (
        <ol className="space-y-1.5">
          {shown.map((v) => (
            <li key={v.id} className="rounded-lg border bg-card px-3 py-2">
              {renaming === v.id ? (
                <form
                  className="flex gap-1.5"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    if (handleResult(await renameVersion(v.id, name), "Renamed") !== null) {
                      setRenaming(null);
                      api.refresh();
                    }
                  }}
                >
                  <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={200} aria-label="Draft name" className="h-7" autoFocus />
                  <Button size="sm" type="submit">
                    Save
                  </Button>
                </form>
              ) : (
                <div className="flex items-start gap-2">
                  <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setOpen(v)}>
                    <span className="block truncate text-sm font-medium">
                      v{v.version_number} · {v.title}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {SOURCE_LABELS[v.source]} · {formatDateTime(v.created_at)} · {v.word_count} w{v.archived_at ? " · archived" : ""}
                    </span>
                    {v.change_summary && <span className="mt-0.5 line-clamp-2 block text-xs text-muted-foreground">{v.change_summary}</span>}
                  </button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon-xs" aria-label={`Actions for version ${v.version_number}`}>
                        <MoreHorizontal />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onSelect={() => setOpen(v)}>
                        <Eye /> View, compare or restore
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onSelect={() => {
                          setRenaming(v.id);
                          setName(v.title);
                        }}
                      >
                        <Pencil /> Rename
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onSelect={async () => {
                          if (handleResult(await duplicateVersion(api.essayId, v.id))) {
                            toast.success("Draft duplicated");
                            api.refresh();
                          }
                        }}
                      >
                        <Copy /> Duplicate
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onSelect={async () => {
                          if (handleResult(await setVersionArchived(v.id, !v.archived_at)) !== null) api.refresh();
                        }}
                      >
                        {v.archived_at ? <ArchiveRestore /> : <Archive />} {v.archived_at ? "Unarchive" : "Archive"}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              )}
            </li>
          ))}
        </ol>
      )}
      {versions.some((v) => v.archived_at) && (
        <Button variant="link" size="sm" className="h-auto p-0 text-xs" onClick={() => setShowArchived((s) => !s)}>
          {showArchived ? "Hide archived drafts" : "Show archived drafts"}
        </Button>
      )}
      <VersionDialog api={api} version={open} onClose={() => setOpen(null)} />
    </div>
  );
}
