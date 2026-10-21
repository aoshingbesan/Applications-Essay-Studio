"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Pill, VerificationBadge } from "@/components/badges";
import { importLetterStudioEvidence, listLetterStudioEvidence, type ImportableEvidence } from "@/server/letter-studio-import";
import { handleResult } from "@/lib/client/result";

/** Copies evidence recorded in Recommendation Letter Studio (same account) into the Story Bank. */
export function ImportFromLetterStudio() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<ImportableEvidence[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setItems(null);
    setError(null);
    setSelected([]);
    const res = await listLetterStudioEvidence();
    if (res.ok) setItems(res.data.items);
    else setError(res.error);
  };

  const importable = items?.filter((i) => !i.alreadyImported) ?? [];

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) void load();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline">
          <Download /> Import from Letter Studio
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Import from Recommendation Letter Studio</DialogTitle>
          <DialogDescription>
            Copy evidence you recorded in Letter Studio into your Story Bank. Imports are copies: editing them here does not change Letter Studio. Verification carries over conservatively — check each story afterwards and add your lessons and motivation.
          </DialogDescription>
        </DialogHeader>
        {error ? (
          <p className="rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground">{error}</p>
        ) : items === null ? (
          <div className="flex justify-center py-8">
            <Loader2 className="size-5 animate-spin text-muted-foreground" aria-label="Loading" />
          </div>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground">No evidence found in Letter Studio for this account.</p>
        ) : (
          <div className="space-y-2">
            {importable.length > 1 && (
              <Button variant="link" size="sm" className="h-auto p-0" onClick={() => setSelected(selected.length === importable.length ? [] : importable.map((i) => i.id))}>
                {selected.length === importable.length ? "Clear selection" : `Select all ${importable.length}`}
              </Button>
            )}
            <ul className="divide-y rounded-lg border">
              {items.map((i) => (
                <li key={i.id} className="flex items-start gap-2.5 px-3 py-2.5">
                  <Checkbox
                    id={`imp-${i.id}`}
                    className="mt-0.5"
                    disabled={i.alreadyImported}
                    checked={i.alreadyImported || selected.includes(i.id)}
                    onCheckedChange={(v) => setSelected((s) => (v === true ? [...s, i.id] : s.filter((x) => x !== i.id)))}
                  />
                  <Label htmlFor={`imp-${i.id}`} className="block min-w-0 flex-1 font-normal">
                    <span className="block text-sm">{i.title}</span>
                    <span className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                      <Pill>{i.category.replace(/_/g, " ")}</Pill>
                      <VerificationBadge value={i.verification} />
                      {i.period && <span>{i.period}</span>}
                      {i.alreadyImported && <span>Already imported</span>}
                    </span>
                  </Label>
                </li>
              ))}
            </ul>
          </div>
        )}
        <DialogFooter>
          <Button
            disabled={busy || selected.length === 0}
            onClick={async () => {
              setBusy(true);
              const res = handleResult(await importLetterStudioEvidence(selected));
              setBusy(false);
              if (!res) return;
              toast.success(`Imported ${res.imported} ${res.imported === 1 ? "story" : "stories"}${res.skipped ? ` (${res.skipped} already imported)` : ""}`);
              setOpen(false);
              router.refresh();
            }}
          >
            {busy && <Loader2 className="animate-spin" />} Import {selected.length || ""} selected
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
