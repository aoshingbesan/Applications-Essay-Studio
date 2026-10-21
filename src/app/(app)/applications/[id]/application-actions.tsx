"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { Archive, ArchiveRestore, CheckCircle2, Copy, MoreHorizontal, Settings2, Trash2, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ConfirmAction } from "@/components/confirm-action";
import { ExportDialog } from "@/components/export-dialog";
import type { Application } from "@/lib/domain/types";
import { deleteApplication, duplicateApplication, setApplicationArchived, setApplicationSubmitted } from "@/server/applications";
import { handleResult } from "@/lib/client/result";

export function ApplicationActions({ application: a, essays }: { application: Application; essays: { id: string; title: string }[] }) {
  const router = useRouter();
  return (
    <>
      {essays.length > 0 && <ExportDialog essays={essays} defaultTitle={a.programme || a.name} />}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" aria-label="More actions">
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem asChild>
            <Link href={`/applications/${a.id}/setup?step=1`}>
              <Settings2 /> Edit setup
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={async () => {
              const res = handleResult(await duplicateApplication(a.id), "Application duplicated");
              if (res) router.push(`/applications/${res.id}`);
            }}
          >
            <Copy /> Duplicate structure
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={async () => {
              if (handleResult(await setApplicationSubmitted(a.id, !a.submitted_at), a.submitted_at ? "Marked as not submitted" : "Marked as submitted") !== null) router.refresh();
            }}
          >
            {a.submitted_at ? <Undo2 /> : <CheckCircle2 />} {a.submitted_at ? "Mark as not submitted" : "Mark as submitted"}
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={async () => {
              if (handleResult(await setApplicationArchived(a.id, !a.archived_at), a.archived_at ? "Application restored" : "Application archived") !== null) router.refresh();
            }}
          >
            {a.archived_at ? <ArchiveRestore /> : <Archive />} {a.archived_at ? "Reopen" : "Archive"}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <ConfirmAction
            trigger={
              <DropdownMenuItem variant="destructive" onSelect={(e) => e.preventDefault()}>
                <Trash2 /> Delete
              </DropdownMenuItem>
            }
            title="Delete this application?"
            description="Its essays, drafts, versions, reviews and checklist are permanently deleted. Documents, stories and exemplars in your library are kept."
            requireText="DELETE"
            onConfirm={async () => {
              if (handleResult(await deleteApplication(a.id), "Application deleted") === null) return false;
              router.push("/applications");
            }}
          />
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
