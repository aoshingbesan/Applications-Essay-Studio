"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/** Editable list of short strings (assessable areas, referee questions). */
export function ListInput({
  id,
  value,
  onChange,
  placeholder,
  max = 20,
  multiline,
}: {
  id: string;
  value: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
  max?: number;
  multiline?: boolean;
}) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const v = draft.trim();
    if (!v || value.includes(v) || value.length >= max) return;
    onChange([...value, v]);
    setDraft("");
  };
  return (
    <div className="space-y-2">
      {value.length > 0 && (
        <ul className={multiline ? "space-y-1.5" : "flex flex-wrap gap-1.5"}>
          {value.map((item, i) => (
            <li
              key={`${item}-${i}`}
              className={
                multiline
                  ? "flex items-start gap-2 rounded-md border bg-card px-3 py-2 text-sm"
                  : "inline-flex items-center gap-1 rounded-full border bg-card py-0.5 pr-1 pl-2.5 text-xs"
              }
            >
              <span className="min-w-0 flex-1 break-words">{item}</span>
              <button
                type="button"
                onClick={() => onChange(value.filter((_, j) => j !== i))}
                className="rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label={`Remove ${item}`}
              >
                <X className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-2">
        <Input
          id={id}
          value={draft}
          placeholder={placeholder}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
        />
        <Button type="button" variant="outline" onClick={add} disabled={!draft.trim() || value.length >= max}>
          <Plus /> Add
        </Button>
      </div>
    </div>
  );
}
