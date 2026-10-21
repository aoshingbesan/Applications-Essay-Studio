"use client";

import { useState } from "react";
import { History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { formatDateTime } from "@/lib/format/date";
import type { EditorApi, VersionSummary } from "../types";
import { SOURCE_LABELS, VersionDialog } from "./version-dialog";

/** Version selector in the editor header: pick a saved version to preview, compare or restore. */
export function VersionMenu({ api, versions }: { api: EditorApi; versions: VersionSummary[] }) {
  const [open, setOpen] = useState<VersionSummary | null>(null);
  const recent = versions.filter((v) => !v.archived_at).slice(0, 12);
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="ghost" aria-label="Versions">
            <History /> <span className="hidden md:inline">Versions ({versions.length})</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-80">
          <DropdownMenuLabel>Current draft is open</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {recent.length === 0 ? (
            <div className="px-2 py-3 text-xs text-muted-foreground">No saved versions yet. Use “Save version” (⌘S).</div>
          ) : (
            recent.map((v) => (
              <DropdownMenuItem key={v.id} onSelect={() => setOpen(v)} className="flex flex-col items-start gap-0">
                <span className="text-sm">
                  v{v.version_number} · {v.title}
                </span>
                <span className="text-xs text-muted-foreground">
                  {SOURCE_LABELS[v.source]} · {formatDateTime(v.created_at)} · {v.word_count} words
                </span>
              </DropdownMenuItem>
            ))
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <VersionDialog api={api} version={open} onClose={() => setOpen(null)} />
    </>
  );
}
