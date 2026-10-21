"use client";

import { useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { SaveIndicator } from "@/components/save-indicator";
import { useAutosave } from "@/hooks/use-autosave";
import { updateApplicationNotes } from "@/server/applications";

export function NotesPanel({ applicationId, initial }: { applicationId: string; initial: string }) {
  const [value, setValue] = useState(initial);
  const autosave = useAutosave<string>(async (v) => (await updateApplicationNotes(applicationId, v)).ok, 1200);
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label htmlFor="app-notes">Notes</Label>
        <SaveIndicator state={autosave.state} lastSavedAt={autosave.lastSavedAt} onRetry={() => void autosave.flush()} />
      </div>
      <Textarea
        id="app-notes"
        rows={14}
        value={value}
        maxLength={30000}
        placeholder="Contacts, interview dates, things to remember…"
        onChange={(e) => {
          setValue(e.target.value);
          autosave.schedule(e.target.value);
        }}
      />
    </div>
  );
}
