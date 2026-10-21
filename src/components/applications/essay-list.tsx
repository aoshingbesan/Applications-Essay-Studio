"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Archive, MoreHorizontal, PenLine, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { StatusBadge } from "@/components/badges";
import { EssayRequirementForm, essayDefaults } from "@/components/applications/essay-requirement-form";
import { ESSAY_TYPE_LABELS } from "@/lib/domain/constants";
import type { Essay } from "@/lib/domain/types";
import { addEssay, deleteEssay, setEssayArchived, updateEssayRequirements } from "@/server/applications";
import { handleResult } from "@/lib/client/result";

/** Essay questions for an application, with add, edit, archive and delete. */
export function EssayList({ applicationId, essays, showOpen }: { applicationId: string; essays: Essay[]; showOpen?: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = useState<Essay | "new" | null>(null);
  const [deleting, setDeleting] = useState<Essay | null>(null);

  return (
    <div className="space-y-3">
      {essays.length > 0 && (
        <ul className="divide-y rounded-xl border bg-card">
          {essays.map((e) => (
            <li key={e.id} className="flex items-start gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium">{e.title}</span>
                  <StatusBadge status={e.status} />
                </div>
                <div className="mt-0.5 text-xs text-muted-foreground">
                  {ESSAY_TYPE_LABELS[e.essay_type]}
                  {e.max_words ? ` · max ${e.max_words} words` : ""}
                  {e.min_words ? ` · min ${e.min_words}` : ""}
                  {showOpen ? ` · ${e.word_count} words drafted` : ""}
                </div>
                {e.prompt && <p className="mt-1.5 line-clamp-2 font-serif text-sm text-muted-foreground">{e.prompt}</p>}
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {showOpen && (
                  <Button asChild size="sm" variant="outline">
                    <Link href={`/studio/${e.id}`}>
                      <PenLine /> Write
                    </Link>
                  </Button>
                )}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${e.title}`}>
                      <MoreHorizontal />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => setEditing(e)}>
                      <Pencil /> Edit requirements
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onSelect={async () => {
                        if (handleResult(await setEssayArchived(e.id, true), "Essay archived") !== null) router.refresh();
                      }}
                    >
                      <Archive /> Archive
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(e)}>
                      <Trash2 /> Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </li>
          ))}
        </ul>
      )}
      <Button variant={essays.length ? "outline" : "default"} onClick={() => setEditing("new")}>
        <Plus /> Add essay question
      </Button>

      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing === "new" ? "Add essay question" : "Edit essay requirements"}</DialogTitle>
            <DialogDescription>Record the requirements exactly as the application states them.</DialogDescription>
          </DialogHeader>
          {editing !== null && (
            <EssayRequirementForm
              initial={essayDefaults(editing === "new" ? null : editing)}
              submitLabel={editing === "new" ? "Add essay" : "Save changes"}
              onCancel={() => setEditing(null)}
              onSubmit={async (values) => {
                const res = editing === "new" ? await addEssay(applicationId, values) : await updateEssayRequirements(editing.id, values);
                if (handleResult(res, editing === "new" ? "Essay added" : "Requirements saved") === null) return false;
                setEditing(null);
                router.refresh();
                return true;
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleting !== null} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{deleting?.title}”?</AlertDialogTitle>
            <AlertDialogDescription>The essay, its drafts, versions and reviews are permanently deleted. Archive it instead to keep them.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={async () => {
                if (!deleting) return;
                if (handleResult(await deleteEssay(deleting.id), "Essay deleted") !== null) router.refresh();
                setDeleting(null);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
