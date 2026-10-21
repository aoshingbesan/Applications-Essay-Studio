"use client";

import { useState } from "react";
import { Check, CopyPlus, Loader2, TriangleAlert, Wand2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Pill } from "@/components/badges";
import { DiffView, diffStats } from "@/components/diff-view";
import { EDIT_ACTIONS, type EditAction } from "@/lib/ai/edit-actions";
import type { CritiqueOutput } from "@/lib/ai/schemas";
import { countWords } from "@/lib/essay/doc";
import { applyAiDocument, saveAiDocumentAsVersion, saveContentAsVersion } from "@/server/essays";
import { handleResult } from "@/lib/client/result";
import type { EditorApi, WorkspaceData } from "../types";
import { useEssayAi } from "../use-ai";
import { applyReplacement, docWithReplacement, resolveTarget, setHighlight, type EditTarget } from "../editor-utils";
import { AiNotice, AiUnavailable, BusyBar } from "./ai-bits";

const GROUPS: { title: string; actions: EditAction[] }[] = [
  { title: "Improve", actions: ["clarity", "strengthen_argument", "specific", "concise", "repetition", "transitions", "narrative_flow", "academic_tone"] },
  { title: "Structure", actions: ["opening", "conclusion", "alternative_structure"] },
  { title: "Strengthen content", actions: ["expand_evidence", "programme_fit", "development_impact", "leadership_evidence"] },
  { title: "Fit and references", actions: ["word_limit", "apply_lessons"] },
  { title: "Critique", actions: ["critique", "explain_weak"] },
];

type Overlap = { exemplar: string; passages: string[] }[];
type EditResponse = { mode: "critique"; critique: CritiqueOutput } | { mode: "revise"; revised: string; changes: string[]; warnings: string[]; overlap: Overlap };

type Proposal =
  | { kind: "revise"; scope: "selection"; jobId: string; label: string; target: EditTarget; original: string; revised: string; changes: string[]; warnings: string[]; overlap: { exemplar: string; passages: string[] }[] }
  | { kind: "revise"; scope: "essay"; jobId: string; label: string; original: string; revised: string; changes: string[]; warnings: string[]; overlap: { exemplar: string; passages: string[] }[] }
  | { kind: "critique"; label: string; target: string; critique: CritiqueOutput };

export function AssistPanel({ data, api }: { data: WorkspaceData; api: EditorApi }) {
  const ai = useEssayAi(data.essay.id);
  const [scope, setScope] = useState<"selection" | "essay">("selection");
  const [instruction, setInstruction] = useState("");
  const [targetWords, setTargetWords] = useState(String(data.essay.max_words ?? ""));
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [saving, setSaving] = useState(false);

  const clear = () => {
    setHighlight(api.editor, null);
    setProposal(null);
  };

  const runAction = async (action: EditAction) => {
    const def = EDIT_ACTIONS[action];
    const essayText = api.getText();
    const whole = scope === "essay" || action === "alternative_structure";
    let target: EditTarget | null = null;
    if (!whole) {
      target = resolveTarget(api.editor, action);
      if (!target) {
        toast.error("Select some text, or place the cursor in a paragraph, first.");
        return;
      }
      setHighlight(api.editor, { from: target.from, to: target.to });
    } else if (!essayText.trim()) {
      toast.error("The essay is empty.");
      return;
    }
    setProposal(null);
    const words = Number(targetWords);
    const res = await ai.run<EditResponse>(def.label, {
      op: "edit",
      action,
      scope: whole ? "essay" : "selection",
      target: whole ? essayText : target!.text,
      essayText,
      targetWords: action === "word_limit" && Number.isFinite(words) && words >= 10 ? Math.round(words) : undefined,
      instruction: instruction.trim() || undefined,
    });
    if (!res?.ok) {
      setHighlight(api.editor, null);
      return;
    }
    const d = res.data;
    if (d.mode === "critique") {
      setProposal({ kind: "critique", label: def.label, target: whole ? "Whole essay" : target!.text, critique: d.critique });
      return;
    }
    if (whole) {
      setProposal({ kind: "revise", scope: "essay", jobId: res.data.jobId, label: def.label, original: essayText, revised: d.revised, changes: d.changes, warnings: d.warnings, overlap: d.overlap });
    } else {
      setProposal({ kind: "revise", scope: "selection", jobId: res.data.jobId, label: def.label, target: target!, original: target!.text, revised: d.revised, changes: d.changes, warnings: d.warnings, overlap: d.overlap });
    }
  };

  const accept = async () => {
    if (!proposal || proposal.kind !== "revise") return;
    setSaving(true);
    try {
      if (proposal.scope === "selection") {
        if (!applyReplacement(api.editor, proposal.target, proposal.revised)) {
          toast.error("That text has changed since you asked for the revision, so it was not replaced. Run the action again.");
          return;
        }
        // One undoable step in the editor; also kept as a version linked to the AI job.
        const ok = await api.saveNow({ kind: "ai_revision", title: proposal.label, summary: proposal.changes.slice(0, 3).join(" "), jobId: proposal.jobId });
        if (ok) toast.success("Revision applied — undo with ⌘Z if needed");
      } else {
        await api.flush();
        const res = handleResult(await applyAiDocument(api.essayId, proposal.jobId, api.revision()), "Revision applied — previous text kept as a version");
        if (!res) return;
        api.replaceAll(res.content, res.revision);
      }
      clear();
    } finally {
      setSaving(false);
    }
  };

  const asVersion = async () => {
    if (!proposal || proposal.kind !== "revise") return;
    setSaving(true);
    try {
      if (proposal.scope === "selection") {
        const doc = docWithReplacement(api.editor, proposal.target, proposal.revised);
        if (!doc) {
          toast.error("That text has changed since you asked for the revision.");
          return;
        }
        if (!handleResult(await saveContentAsVersion(api.essayId, doc, `${proposal.label} (alternative)`, proposal.changes.slice(0, 3).join(" "), proposal.jobId))) return;
      } else if (!handleResult(await saveAiDocumentAsVersion(api.essayId, proposal.jobId))) {
        return;
      }
      toast.success("Saved as a new version; your current draft is unchanged");
      api.refresh();
      clear();
    } finally {
      setSaving(false);
    }
  };

  const stats = proposal?.kind === "revise" ? diffStats(proposal.original, proposal.revised) : null;

  return (
    <div className="space-y-4">
      <AiUnavailable reason={api.aiUnavailableReason} />
      <BusyBar
        label={ai.busy}
        onCancel={() => {
          ai.cancel();
          setHighlight(api.editor, null);
        }}
      />

      {proposal?.kind === "revise" && (
        <section aria-label="Proposed revision" className="space-y-3 rounded-lg border border-ink/30 bg-card p-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">{proposal.label}</h3>
            <span className="text-xs text-muted-foreground">
              {countWords(proposal.original)} → {countWords(proposal.revised)} words · +{stats?.added} −{stats?.removed}
            </span>
          </div>
          {proposal.overlap.length > 0 && (
            <Alert variant="destructive">
              <TriangleAlert />
              <AlertDescription>This revision repeats wording from an exemplar ({proposal.overlap.map((o) => o.exemplar).join(", ")}). Do not use it as is.</AlertDescription>
            </Alert>
          )}
          <div className="max-h-72 overflow-y-auto rounded-md border bg-paper p-3">
            <DiffView before={proposal.original} after={proposal.revised} className="text-sm" />
          </div>
          {proposal.changes.length > 0 && (
            <div>
              <div className="text-xs font-medium">Main changes</div>
              <ul className="mt-0.5 list-disc space-y-0.5 pl-4 text-xs text-muted-foreground">
                {proposal.changes.map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ul>
            </div>
          )}
          {proposal.warnings.length > 0 && (
            <ul className="space-y-0.5 text-xs text-warning">
              {proposal.warnings.map((w, i) => (
                <li key={i}>⚠ {w}</li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap gap-1.5">
            <Button size="sm" onClick={() => void accept()} disabled={saving}>
              {saving ? <Loader2 className="animate-spin" /> : <Check />} Accept
            </Button>
            <Button size="sm" variant="outline" onClick={() => void asVersion()} disabled={saving}>
              <CopyPlus /> Insert as new version
            </Button>
            <Button size="sm" variant="ghost" onClick={clear} disabled={saving}>
              <X /> Reject
            </Button>
          </div>
        </section>
      )}

      {proposal?.kind === "critique" && (
        <section aria-label="Critique" className="space-y-2 rounded-lg border bg-card p-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">{proposal.label}</h3>
            <Button size="icon-xs" variant="ghost" aria-label="Close critique" onClick={clear}>
              <X />
            </Button>
          </div>
          <p className="text-sm">{proposal.critique.assessment}</p>
          <ul className="space-y-2">
            {proposal.critique.issues.map((i, k) => (
              <li key={k} className="rounded-md border p-2 text-xs">
                <div className="flex items-center gap-1.5">
                  <Pill tone={i.severity === "critical" ? "bg-red-50 text-red-800 ring-red-200 dark:bg-red-950 dark:text-red-200 dark:ring-red-900" : undefined}>{i.severity === "critical" ? "Critical" : "Optional"}</Pill>
                  <span className="font-medium">{i.issue}</span>
                </div>
                <p className="mt-1 text-muted-foreground">{i.why}</p>
                <p className="mt-1">→ {i.suggestion}</p>
              </li>
            ))}
          </ul>
          {proposal.critique.alternative_structure.length > 0 && (
            <div>
              <div className="text-xs font-medium">Alternative structure</div>
              <ol className="mt-1 list-decimal space-y-0.5 pl-4 text-xs">
                {proposal.critique.alternative_structure.map((s, k) => (
                  <li key={k}>
                    <span className="font-medium">{s.section}</span> — <span className="text-muted-foreground">{s.purpose}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </section>
      )}

      <fieldset className="space-y-2">
        <legend className="text-xs font-medium">Apply to</legend>
        <RadioGroup value={scope} onValueChange={(v) => setScope(v as typeof scope)} className="flex gap-4">
          <div className="flex items-center gap-1.5">
            <RadioGroupItem id="scope-sel" value="selection" />
            <Label htmlFor="scope-sel" className="text-xs font-normal">
              Selected text / current paragraph
            </Label>
          </div>
          <div className="flex items-center gap-1.5">
            <RadioGroupItem id="scope-essay" value="essay" />
            <Label htmlFor="scope-essay" className="text-xs font-normal">
              Whole essay
            </Label>
          </div>
        </RadioGroup>
      </fieldset>

      <div className="space-y-1">
        <Label htmlFor="assist-instruction" className="text-xs">
          Extra instruction (optional)
        </Label>
        <Textarea id="assist-instruction" rows={2} value={instruction} onChange={(e) => setInstruction(e.target.value)} placeholder="e.g. Keep the second sentence as it is" maxLength={1000} />
      </div>

      {GROUPS.map((g) => (
        <div key={g.title}>
          <h3 className="mb-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">{g.title}</h3>
          <div className="flex flex-wrap gap-1.5">
            {g.actions.map((a) => (
              <Button
                key={a}
                size="xs"
                variant="outline"
                disabled={!api.aiAvailable || ai.busy !== null || (a === "apply_lessons" && (!data.essay.use_exemplars || data.lessons.length === 0))}
                onClick={() => void runAction(a)}
                title={a === "apply_lessons" && (!data.essay.use_exemplars || !data.lessons.length) ? "Enable exemplar guidance and select lessons first" : undefined}
              >
                {EDIT_ACTIONS[a].label}
              </Button>
            ))}
          </div>
          {g.title === "Fit and references" && (
            <div className="mt-2 flex items-center gap-2">
              <Label htmlFor="target-words" className="text-xs font-normal">
                Target words
              </Label>
              <Input id="target-words" type="number" inputMode="numeric" className="h-7 w-24 text-xs" value={targetWords} onChange={(e) => setTargetWords(e.target.value)} />
            </div>
          )}
        </div>
      ))}

      <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
        <Wand2 className="mt-0.5 size-3 shrink-0" aria-hidden /> Edits keep your meaning and add no achievements that are not in your evidence. Placeholders like [ADD: …] mark details only you can supply.
      </p>
      <AiNotice />
    </div>
  );
}
