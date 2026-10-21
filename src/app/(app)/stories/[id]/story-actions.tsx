"use client";

import { useRouter } from "next/navigation";
import { Archive, ArchiveRestore, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmAction } from "@/components/confirm-action";
import type { Story } from "@/lib/domain/types";
import { deleteStory, setStoryArchived } from "@/server/library";
import { handleResult } from "@/lib/client/result";

export function StoryActions({ story }: { story: Story }) {
  const router = useRouter();
  return (
    <>
      <Button
        variant="outline"
        onClick={async () => {
          if (handleResult(await setStoryArchived(story.id, !story.archived_at), story.archived_at ? "Story restored" : "Story archived") !== null) router.refresh();
        }}
      >
        {story.archived_at ? <ArchiveRestore /> : <Archive />} {story.archived_at ? "Restore" : "Archive"}
      </Button>
      <ConfirmAction
        trigger={
          <Button variant="ghost" aria-label="Delete story">
            <Trash2 />
          </Button>
        }
        title="Delete this story?"
        description="It will be removed from the Story Bank and unlinked from every essay. Saved essay versions keep their text."
        onConfirm={async () => {
          if (handleResult(await deleteStory(story.id), "Story deleted") === null) return false;
          router.push("/stories");
        }}
      />
    </>
  );
}
