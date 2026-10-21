"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { PRIVACY_DESCRIPTIONS, PRIVACY_LABELS, PRIVACY_LEVELS, type EntrySection, type Privacy } from "@/lib/library/sections";
import { setSectionPrivacy } from "@/server/library";
import { handleResult } from "@/lib/client/result";

/** The section's default privacy for new entries, optionally applied to existing ones. */
export function SectionPrivacy({ section, value, entryCount }: { section: EntrySection; value: Privacy; entryCount: number }) {
  const router = useRouter();
  const [choice, setChoice] = useState<Privacy>(value);
  const [applyAll, setApplyAll] = useState(false);
  const [busy, setBusy] = useState(false);
  const changed = choice !== value || applyAll;

  return (
    <section aria-labelledby="privacy-h" className="rounded-xl border bg-card p-4">
      <h2 id="privacy-h" className="text-sm font-semibold">
        Privacy for this section
      </h2>
      <p className="mt-1 text-xs text-muted-foreground">New entries start with this setting. You can change any entry individually.</p>
      <RadioGroup value={choice} onValueChange={(v) => setChoice(v as Privacy)} className="mt-3 space-y-1">
        {PRIVACY_LEVELS.map((p) => (
          <Label key={p} htmlFor={`sp-${p}`} className="flex cursor-pointer items-start gap-2.5 rounded-md p-1.5 font-normal hover:bg-muted/50">
            <RadioGroupItem id={`sp-${p}`} value={p} className="mt-0.5" />
            <span>
              <span className="block text-sm font-medium">{PRIVACY_LABELS[p]}</span>
              <span className="block text-xs text-muted-foreground">{PRIVACY_DESCRIPTIONS[p]}</span>
            </span>
          </Label>
        ))}
      </RadioGroup>
      {entryCount > 0 && (
        <div className="mt-3 flex items-start gap-2">
          <Checkbox id="sp-all" checked={applyAll} onCheckedChange={(v) => setApplyAll(v === true)} className="mt-0.5" />
          <Label htmlFor="sp-all" className="text-xs font-normal">
            Also apply to the {entryCount} existing {entryCount === 1 ? "entry" : "entries"} in this section
          </Label>
        </div>
      )}
      <Button
        size="sm"
        className="mt-3"
        disabled={!changed || busy}
        onClick={async () => {
          setBusy(true);
          const ok = handleResult(await setSectionPrivacy(section, choice, applyAll), "Privacy setting saved");
          setBusy(false);
          if (ok !== null) {
            setApplyAll(false);
            router.refresh();
          }
        }}
      >
        Save
      </Button>
    </section>
  );
}
