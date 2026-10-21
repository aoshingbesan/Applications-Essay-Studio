"use client";

import { useState } from "react";
import { FileText, ListTree, Loader2, Search, Sparkles, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Pill } from "@/components/badges";
import type { DraftOutput, GapQuestion, Outline, PromptAnalysis } from "@/lib/ai/schemas";
import type { EssayDoc } from "@/lib/essay/doc";
import type { SourceRefs } from "@/lib/domain/types";
import { applyAiDocument, saveAiDocumentAsVersion, saveGapAnswers } from "@/server/essays";
import { handleResult } from "@/lib/client/result";
import type { EditorApi, WorkspaceData } from "../types";
import { useEssayAi } from "../use-ai";
import { AiNotice, AiUnavailable, BusyBar, StepHeader } from "./ai-bits";
import { OutlineEditor } from "./outline-editor";
import { DocPreview } from "./doc-preview";

interface DraftResult {
  jobId: string;
  doc: EssayDoc;
  wordCount: number;
  flags: DraftOutput["flags"];
  usedRefs: SourceRefs;
  overlap: { exemplar: string; passages: string[] }[];
}

function FlagList({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div>
      <div className="text-xs font-medium">{title}</div>
      <ul className="mt-0.5 list-disc space-y-0.5 pl-4 text-xs text-muted-foreground">
        {items.map((x, i) => (
          <li key={i}>{x}</li>
        ))}
      </ul>
    </div>
  );
}

export function WorkflowPanel({ data, api, goTo }: { data: WorkspaceData; api: EditorApi; goTo: (tab: string) => void }) {
  const { essay } = data;
  const ai = useEssayAi(essay.id);
  const [analysis, setAnalysis] = useState<PromptAnalysis | null>(essay.prompt_analysis);
  const [questions, setQuestions] = useState<GapQuestion[]>(essay.gap_questions);
  const [answersDirty, setAnswersDirty] = useState(false);
  const [outline, setOutline] = useState<Outline | null>(essay.outline);
  const [outlineKey, setOutlineKey] = useState(0);
  const [outlineInstruction, setOutlineInstruction] = useState("");
  const [includeHeadings, setIncludeHeadings] = useState(false);
  const [draftInstruction, setDraftInstruction] = useState("");
  const [draft, setDraft] = useState<DraftResult | null>(null);
  const [applying, setApplying] = useState(false);
  const approved = essay.outline_status === "approved";
  const linkedCount = data.links.length;
  const disabled = !api.aiAvailable || ai.busy !== null;
  const titleFor = (refs: SourceRefs) =>
    [
      ...(refs.entry_ids ?? []).map((id) => data.entries.find((e) => e.id === id)?.title),
      ...(refs.document_ids ?? []).map((id) => data.documents.find((d) => d.id === id)?.title),
    ].filter((x): x is string => Boolean(x));

  const analyse = async () => {
    const res = await ai.run<{ analysis: PromptAnalysis }>("Analysing the prompt", { op: "analyse_prompt" });
    if (res?.ok) {
      setAnalysis(res.data.analysis);
      api.refresh();
    }
  };

  const findGaps = async () => {
    if (answersDirty) await saveGapAnswers(essay.id, questions.map((q) => ({ id: q.id, answer: q.answer })));
    const res = await ai.run<{ questions: GapQuestion[] }>("Finding gaps", { op: "gap_questions" });
    if (res?.ok) {
      setQuestions(res.data.questions);
      setAnswersDirty(false);
    }
  };

  const saveAnswers = async () => {
    if (handleResult(await saveGapAnswers(essay.id, questions.map((q) => ({ id: q.id, answer: q.answer }))), "Answers saved") !== null) setAnswersDirty(false);
  };

  const makeOutline = async () => {
    if (answersDirty) await saveAnswers();
    const res = await ai.run<{ outline: Outline; autoSelected: boolean }>("Generating the outline", { op: "outline", instructions: outlineInstruction });
    if (res?.ok) {
      setOutline(res.data.outline);
      setOutlineKey((k) => k + 1);
      if (res.data.autoSelected) toast.info("No evidence was selected, so the most relevant Available Story Bank entries were used. Review them in the Evidence tab.");
      api.refresh();
    }
  };

  const makeDraft = async () => {
    const res = await ai.run<DraftResult>("Writing the draft", { op: "draft", includeHeadings, instructions: draftInstruction });
    if (res?.ok) setDraft(res.data);
  };

  const applyDraft = async (mode: "replace" | "version") => {
    if (!draft) return;
    setApplying(true);
    try {
      if (mode === "replace") {
        await api.flush();
        const res = handleResult(await applyAiDocument(essay.id, draft.jobId, api.revision()), "Draft applied — your previous text was kept as a version");
        if (!res) return;
        api.replaceAll(res.content, res.revision);
      } else {
        if (!handleResult(await saveAiDocumentAsVersion(essay.id, draft.jobId), "Saved as a separate version")) return;
        api.refresh();
      }
      setDraft(null);
    } finally {
      setApplying(false);
    }
  };

  return (
    <div className="space-y-6">
      <AiUnavailable reason={api.aiUnavailableReason} />
      <BusyBar label={ai.busy} onCancel={ai.cancel} />

      <section className="space-y-2">
        <StepHeader n={1} title="Analyse the prompt" done={Boolean(analysis)}>
          The central question, subquestions, criteria and restrictions.
        </StepHeader>
        {analysis ? (
          <div className="space-y-2 rounded-lg border bg-card p-3 text-sm">
            <p className="font-serif">{analysis.central_question}</p>
            {analysis.subquestions.length > 0 && (
              <ul className="list-disc space-y-0.5 pl-4 text-xs text-muted-foreground">
                {analysis.subquestions.map((q, i) => (
                  <li key={i}>{q}</li>
                ))}
              </ul>
            )}
            {analysis.evaluation_criteria.length > 0 && (
              <ul className="space-y-1 text-xs">
                {analysis.evaluation_criteria.map((c, i) => (
                  <li key={i}>
                    <Pill className="mr-1 text-[0.6rem]" tone={c.basis === "stated" ? undefined : "bg-violet-50 text-violet-800 ring-violet-200 dark:bg-violet-950 dark:text-violet-200 dark:ring-violet-900"}>
                      {c.basis === "stated" ? "Stated" : "Inferred"}
                    </Pill>
                    <span className="font-medium">{c.criterion}</span> — <span className="text-muted-foreground">{c.explanation}</span>
                  </li>
                ))}
              </ul>
            )}
            {analysis.format_restrictions.length > 0 && <p className="text-xs text-muted-foreground">Restrictions: {analysis.format_restrictions.join("; ")}</p>}
            {analysis.word_limit_note && <p className="text-xs text-muted-foreground">{analysis.word_limit_note}</p>}
          </div>
        ) : null}
        <Button size="sm" variant={analysis ? "ghost" : "default"} onClick={() => void analyse()} disabled={disabled || !essay.prompt.trim()}>
          <Search /> {analysis ? "Re-analyse" : "Analyse prompt"}
        </Button>
        {!essay.prompt.trim() && <p className="text-xs text-warning">Add the exact prompt to this essay first.</p>}
      </section>

      <section className="space-y-2">
        <StepHeader n={2} title="Gather relevant evidence" done={linkedCount > 0}>
          {linkedCount > 0 ? `${linkedCount} item${linkedCount === 1 ? "" : "s"} selected for this essay.` : "Nothing selected yet — the most relevant items will be chosen automatically."}
        </StepHeader>
        <Button size="sm" variant="outline" onClick={() => goTo("evidence")}>
          Choose evidence
        </Button>
      </section>

      <section className="space-y-2">
        <StepHeader n={3} title="Writing references (optional)" done={essay.use_exemplars && data.lessons.length > 0}>
          {essay.use_exemplars && data.lessons.length
            ? `Using ${data.lessons.length} exemplar lesson${data.lessons.length === 1 ? "" : "s"}.`
            : "Exemplar lessons are used only if you enable them."}
        </StepHeader>
        <Button size="sm" variant="outline" onClick={() => goTo("exemplars")}>
          Choose writing references
        </Button>
      </section>

      <section className="space-y-2">
        <StepHeader n={4} title="Identify gaps" done={questions.length > 0 && questions.every((q) => q.answer.trim() || q.importance !== "critical")}>
          Targeted questions about missing facts. You can continue with partial answers.
        </StepHeader>
        {questions.length > 0 && (
          <ol className="space-y-2.5">
            {questions.map((q, i) => (
              <li key={q.id} className="space-y-1">
                <Label htmlFor={`gap-${q.id}`} className="text-sm leading-snug">
                  {q.question}
                  {q.importance === "critical" && <span className="ml-1 text-xs font-normal text-warning">Important</span>}
                </Label>
                <p className="text-xs text-muted-foreground">{q.why}</p>
                <Textarea
                  id={`gap-${q.id}`}
                  rows={2}
                  value={q.answer}
                  onChange={(e) => {
                    const answer = e.target.value;
                    setQuestions((qs) => qs.map((x, j) => (j === i ? { ...x, answer } : x)));
                    setAnswersDirty(true);
                  }}
                  placeholder="Your answer (facts only)"
                />
              </li>
            ))}
          </ol>
        )}
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant={questions.length ? "ghost" : "default"} onClick={() => void findGaps()} disabled={disabled}>
            <Sparkles /> {questions.length ? "Ask new questions" : "Find gaps"}
          </Button>
          {answersDirty && (
            <Button size="sm" variant="outline" onClick={() => void saveAnswers()}>
              Save answers
            </Button>
          )}
        </div>
      </section>

      <section className="space-y-2">
        <StepHeader n={5} title="Outline" done={approved}>
          Thesis, sections, evidence and word allocation. Edit, then approve it before drafting.
        </StepHeader>
        {outline && <OutlineEditor key={outlineKey} essayId={essay.id} initial={outline} approved={approved} maxWords={essay.max_words} onSaved={api.refresh} />}
        <Textarea rows={2} value={outlineInstruction} onChange={(e) => setOutlineInstruction(e.target.value)} placeholder="Optional instruction, e.g. “Lead with the library negotiation story”" aria-label="Outline instruction" />
        <Button size="sm" variant={outline ? "ghost" : "default"} onClick={() => void makeOutline()} disabled={disabled || !essay.prompt.trim()}>
          <ListTree /> {outline ? "Regenerate outline" : "Generate outline"}
        </Button>
      </section>

      <section className="space-y-2">
        <StepHeader n={6} title="Generate an original draft">
          {approved ? "Uses the approved outline, your evidence and any selected lessons." : "Approve an outline first."}
        </StepHeader>
        <div className="flex items-center gap-2">
          <Switch id="draft-headings" checked={includeHeadings} onCheckedChange={setIncludeHeadings} />
          <Label htmlFor="draft-headings" className="text-xs font-normal">
            Include section headings
          </Label>
        </div>
        <Textarea rows={2} value={draftInstruction} onChange={(e) => setDraftInstruction(e.target.value)} placeholder="Optional instruction for this draft" aria-label="Draft instruction" />
        <Button size="sm" onClick={() => void makeDraft()} disabled={disabled || !approved}>
          <FileText /> Generate draft
        </Button>
      </section>

      <section className="space-y-2">
        <StepHeader n={7} title="Review the draft">
          Check it against the prompt, criteria and your evidence.
        </StepHeader>
        <Button size="sm" variant="outline" onClick={() => goTo("review")}>
          Open review
        </Button>
      </section>
      <section className="space-y-2">
        <StepHeader n={8} title="Refine">
          Edit directly, or select text and use the Assist tools. Every AI change is shown before it is applied.
        </StepHeader>
        <Button size="sm" variant="outline" onClick={() => goTo("assist")}>
          Open Assist
        </Button>
      </section>
      <section className="space-y-2">
        <StepHeader n={9} title="Finalise" done={essay.status === "ready_to_submit" || essay.status === "submitted"}>
          Run the final checks and mark the essay Ready to Submit.
        </StepHeader>
        <Button size="sm" variant="outline" onClick={() => goTo("review")}>
          Final checklist
        </Button>
      </section>

      <AiNotice />

      <Dialog open={draft !== null} onOpenChange={(o) => !o && !applying && setDraft(null)}>
        <DialogContent className="max-h-[94vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Generated draft</DialogTitle>
            <DialogDescription>
              {draft?.wordCount} words{essay.max_words ? ` (limit ${essay.max_words})` : ""}. Nothing has changed in your essay yet. Check every claim against your own records before using it.
            </DialogDescription>
          </DialogHeader>
          {draft && (
            <div className="space-y-4">
              {draft.overlap.length > 0 && (
                <Alert variant="destructive">
                  <TriangleAlert />
                  <AlertTitle>Passages match an exemplar</AlertTitle>
                  <AlertDescription>
                    {draft.overlap.map((o) => `“${o.exemplar}”: ${o.passages.length} passage(s)`).join("; ")}. Rewrite them in your own words before using this draft.
                  </AlertDescription>
                </Alert>
              )}
              <div className="max-h-[48vh] overflow-y-auto rounded-sm border bg-paper px-6 py-6 sm:px-10">
                <DocPreview doc={draft.doc} />
              </div>
              <div className="grid gap-3 rounded-lg border bg-muted/30 p-3 sm:grid-cols-2">
                <FlagList title="Claims to confirm" items={draft.flags.unverified_claims} />
                <FlagList title="Missing information" items={draft.flags.missing_information} />
                <FlagList title="Requirements not fully addressed" items={draft.flags.requirements_not_addressed} />
                <FlagList title="Conflicting sources" items={draft.flags.source_conflicts} />
                <FlagList title="Notes" items={draft.flags.notes} />
                <FlagList title="Evidence used" items={titleFor(draft.usedRefs)} />
              </div>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="ghost" disabled={applying} onClick={() => setDraft(null)}>
              Discard
            </Button>
            <Button variant="outline" disabled={applying} onClick={() => void applyDraft("version")}>
              Save as separate version
            </Button>
            <Button disabled={applying} onClick={() => void applyDraft("replace")}>
              {applying && <Loader2 className="animate-spin" />} Use this draft
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
