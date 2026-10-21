"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Archive, ArchiveRestore, FolderPlus, Loader2, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ConfirmAction } from "@/components/confirm-action";
import { ExemplarMetaFields, exemplarMetaDefaults } from "@/components/exemplars/exemplar-meta-fields";
import { exemplarMetaSchema, type ExemplarMetaInput, type ExemplarMetaValues } from "@/lib/domain/schemas";
import type { Application, Exemplar } from "@/lib/domain/types";
import { deleteExemplar, setExemplarArchived, setExemplarLink, updateExemplarMeta } from "@/server/exemplars";
import { handleResult } from "@/lib/client/result";

type App = Pick<Application, "id" | "name" | "programme" | "institution">;

function EditMeta({ exemplar, onDone }: { exemplar: Exemplar; onDone: () => void }) {
  const form = useForm<ExemplarMetaInput, unknown, ExemplarMetaValues>({ resolver: zodResolver(exemplarMetaSchema), defaultValues: exemplarMetaDefaults(exemplar) });
  return (
    <form
      className="space-y-5"
      noValidate
      onSubmit={form.handleSubmit(async () => {
        if (handleResult(await updateExemplarMeta(exemplar.id, form.getValues()), "Details saved") !== null) onDone();
      })}
    >
      <ExemplarMetaFields form={form} />
      <Button type="submit" disabled={form.formState.isSubmitting}>
        {form.formState.isSubmitting && <Loader2 className="animate-spin" />} Save details
      </Button>
    </form>
  );
}

export function ExemplarActions({ exemplar, applications, linkedIds }: { exemplar: Exemplar; applications: App[]; linkedIds: string[] }) {
  const router = useRouter();
  const [dialog, setDialog] = useState<"edit" | "apps" | null>(null);
  const [linked, setLinked] = useState(new Set(linkedIds));

  return (
    <>
      <Button variant="outline" onClick={() => setDialog("apps")}>
        <FolderPlus /> Add to application
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" aria-label="More actions">
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setDialog("edit")}>
            <Pencil /> Edit details
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={async () => {
              if (handleResult(await setExemplarArchived(exemplar.id, !exemplar.archived_at), exemplar.archived_at ? "Exemplar restored" : "Exemplar archived") !== null) router.refresh();
            }}
          >
            {exemplar.archived_at ? <ArchiveRestore /> : <Archive />} {exemplar.archived_at ? "Restore" : "Archive"}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <ConfirmAction
            trigger={
              <DropdownMenuItem variant="destructive" onSelect={(e) => e.preventDefault()}>
                <Trash2 /> Delete
              </DropdownMenuItem>
            }
            title="Delete this exemplar?"
            description="The uploaded file, its text, all cached analyses, lessons selected from it and its links to applications are permanently deleted. Your own drafts are not changed."
            onConfirm={async () => {
              if (handleResult(await deleteExemplar(exemplar.id), "Exemplar deleted") === null) return false;
              router.push("/exemplars");
            }}
          />
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={dialog !== null} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
          {dialog === "edit" ? (
            <>
              <DialogHeader>
                <DialogTitle>Edit exemplar details</DialogTitle>
                <DialogDescription>Details only. The essay text itself stays read-only here.</DialogDescription>
              </DialogHeader>
              <EditMeta
                exemplar={exemplar}
                onDone={() => {
                  setDialog(null);
                  router.refresh();
                }}
              />
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>Add to application</DialogTitle>
                <DialogDescription>Attached exemplars are available as writing references in that application&apos;s essays. One exemplar can serve several applications.</DialogDescription>
              </DialogHeader>
              {applications.length === 0 ? (
                <p className="text-sm text-muted-foreground">You have no active applications yet.</p>
              ) : (
                <ul className="space-y-2">
                  {applications.map((a) => (
                    <li key={a.id} className="flex items-center gap-2.5">
                      <Checkbox
                        id={`link-${a.id}`}
                        checked={linked.has(a.id)}
                        onCheckedChange={async (v) => {
                          const on = v === true;
                          if (handleResult(await setExemplarLink(exemplar.id, a.id, on)) === null) return;
                          setLinked((s) => {
                            const n = new Set(s);
                            if (on) n.add(a.id);
                            else n.delete(a.id);
                            return n;
                          });
                          router.refresh();
                        }}
                      />
                      <Label htmlFor={`link-${a.id}`} className="font-normal">
                        {a.programme || a.name} <span className="text-muted-foreground">· {a.institution}</span>
                      </Label>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
