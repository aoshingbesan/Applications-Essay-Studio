"use client";

import { useRouter } from "next/navigation";
import { Archive, ArchiveRestore, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmAction } from "@/components/confirm-action";
import type { LibraryEntry } from "@/lib/domain/types";
import { deleteEntry, setEntryArchived } from "@/server/library";
import { handleResult } from "@/lib/client/result";

export function EntryActions({ entry }: { entry: LibraryEntry }) {
  const router = useRouter();
  return (
    <>
      <Button
        variant="outline"
        onClick={async () => {
          if (handleResult(await setEntryArchived(entry.id, !entry.archived_at), entry.archived_at ? "Entry restored" : "Entry archived") !== null) router.refresh();
        }}
      >
        {entry.archived_at ? <ArchiveRestore /> : <Archive />} {entry.archived_at ? "Restore" : "Archive"}
      </Button>
      <ConfirmAction
        trigger={
          <Button variant="ghost" aria-label="Delete entry">
            <Trash2 />
          </Button>
        }
        title="Delete this entry?"
        description="It is removed from every section and unlinked from essays. Saved essay versions keep their text, and linked documents are kept."
        onConfirm={async () => {
          if (handleResult(await deleteEntry(entry.id), "Entry deleted") === null) return false;
          router.push(`/library/${entry.section}`);
        }}
      />
    </>
  );
}
