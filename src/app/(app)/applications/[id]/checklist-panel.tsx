"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState } from "@/components/empty-state";
import type { ApplicationRequirement } from "@/lib/domain/types";
import { addRequirementItem, deleteRequirementItem, toggleRequirementItem } from "@/server/applications";
import { handleResult } from "@/lib/client/result";
import { formatDate } from "@/lib/format/date";
import { ListChecks } from "lucide-react";
import { cn } from "@/lib/utils";

export function ChecklistPanel({ applicationId, items }: { applicationId: string; items: ApplicationRequirement[] }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<"requirement" | "milestone">("requirement");
  const [due, setDue] = useState("");
  const [busy, setBusy] = useState(false);

  const add = async () => {
    if (!title.trim()) return;
    setBusy(true);
    const res = handleResult(await addRequirementItem(applicationId, { kind, title, details: "", due_date: due }));
    setBusy(false);
    if (!res) return;
    setTitle("");
    setDue("");
    router.refresh();
  };

  return (
    <div className="space-y-4">
      <form
        className="grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-[10rem_1fr_10rem_auto] sm:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          void add();
        }}
      >
        <div className="space-y-1.5">
          <Label htmlFor="req-kind">Type</Label>
          <Select value={kind} onValueChange={(v) => setKind(v as typeof kind)}>
            <SelectTrigger id="req-kind" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="requirement">Requirement</SelectItem>
              <SelectItem value="milestone">Milestone</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="req-title">Item</Label>
          <Input id="req-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Two academic references" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="req-due">Due date</Label>
          <Input id="req-due" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
        </div>
        <Button type="submit" disabled={busy || !title.trim()}>
          <Plus /> Add
        </Button>
      </form>

      {items.length === 0 ? (
        <EmptyState icon={ListChecks} title="No checklist items" description="Track non-essay requirements (references, transcripts, tests) and your own milestones." />
      ) : (
        <ul className="divide-y rounded-xl border bg-card">
          {items.map((r) => (
            <li key={r.id} className="flex items-center gap-3 px-4 py-2.5">
              <Checkbox
                id={`req-${r.id}`}
                checked={Boolean(r.completed_at)}
                onCheckedChange={async (v) => {
                  if (handleResult(await toggleRequirementItem(r.id, v === true)) !== null) router.refresh();
                }}
              />
              <label htmlFor={`req-${r.id}`} className={cn("min-w-0 flex-1 text-sm", r.completed_at && "text-muted-foreground line-through")}>
                {r.title}
                <span className="ml-2 text-xs text-muted-foreground no-underline">
                  {r.kind === "milestone" ? "Milestone" : "Requirement"}
                  {r.due_date ? ` · due ${formatDate(r.due_date)}` : ""}
                </span>
              </label>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Delete ${r.title}`}
                onClick={async () => {
                  if (handleResult(await deleteRequirementItem(r.id)) !== null) router.refresh();
                }}
              >
                <Trash2 />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
