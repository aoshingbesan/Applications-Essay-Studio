"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Info, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { appendToNarrative } from "@/server/library";
import { handleResult, postJson, toastApiError } from "@/lib/client/result";
import type { EntrySection, Privacy } from "@/lib/library/sections";

interface Question {
  entryId: string | null;
  question: string;
  why: string;
  focus: string;
}

/** AI follow-up questions that help expand vague or incomplete entries. Only Available entries are sent. */
export function GuidedQuestions({
  section,
  sectionTitle,
  entries,
  aiUnavailableReason,
}: {
  section: EntrySection;
  sectionTitle: string;
  entries: { id: string; title: string; privacy: Privacy }[];
  aiUnavailableReason: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [questions, setQuestions] = useState<Question[] | null>(null);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [saved, setSaved] = useState<Record<number, boolean>>({});
  const notShared = entries.filter((e) => e.privacy !== "available").length;
  const titleOf = (id: string | null) => entries.find((e) => e.id === id)?.title;

  const ask = async () => {
    setBusy(true);
    const res = await postJson<{ questions: Question[] }>("/api/library/questions", { idempotencyKey: crypto.randomUUID(), section });
    setBusy(false);
    if (!res.ok) return toastApiError(res.error);
    setQuestions(res.data.questions);
    setAnswers({});
    setSaved({});
  };

  return (
    <section aria-labelledby="gq-h" className="rounded-xl border bg-card p-4">
      <h2 id="gq-h" className="text-sm font-semibold">
        Guided questions
      </h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Claude reads this section and asks about anything vague or missing, so your entries become specific enough to use in essays.
      </p>
      {notShared > 0 && (
        <p className="mt-2 flex items-start gap-1.5 text-xs text-muted-foreground">
          <Info className="mt-px size-3 shrink-0" aria-hidden />
          {notShared} {notShared === 1 ? "entry is" : "entries are"} Private or Ask first and will not be sent.
        </p>
      )}
      {aiUnavailableReason ? (
        <p className="mt-3 rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">{aiUnavailableReason}</p>
      ) : (
        <Button size="sm" variant={questions ? "ghost" : "outline"} className="mt-3" onClick={() => void ask()} disabled={busy}>
          {busy ? <Loader2 className="animate-spin" /> : <Sparkles />} {questions ? "Ask again" : `Suggest questions for ${sectionTitle}`}
        </Button>
      )}
      {questions && questions.length === 0 && <p className="mt-3 text-sm text-muted-foreground">No questions — this section looks well developed.</p>}
      {questions && questions.length > 0 && (
        <ol className="mt-4 space-y-4">
          {questions.map((q, i) => (
            <li key={i} className="space-y-1.5">
              <p className="text-sm font-medium">{q.question}</p>
              <p className="text-xs text-muted-foreground">
                {q.entryId ? <>About “{titleOf(q.entryId)}”. </> : <>Suggests a new entry. </>}
                {q.why}
              </p>
              {q.entryId ? (
                saved[i] ? (
                  <p className="text-xs text-success">Added to the entry&apos;s narrative.</p>
                ) : (
                  <>
                    <Textarea
                      rows={3}
                      aria-label={`Answer: ${q.question}`}
                      value={answers[i] ?? ""}
                      onChange={(e) => setAnswers((a) => ({ ...a, [i]: e.target.value }))}
                      placeholder="Your answer, in your own words"
                    />
                    <Button
                      size="xs"
                      disabled={!answers[i]?.trim()}
                      onClick={async () => {
                        if (handleResult(await appendToNarrative(q.entryId!, q.question, answers[i] ?? ""), "Answer added") !== null) {
                          setSaved((s) => ({ ...s, [i]: true }));
                          router.refresh();
                        }
                      }}
                    >
                      Add to entry
                    </Button>
                  </>
                )
              ) : (
                <Button asChild size="xs" variant="outline">
                  <Link href={`/library/entry/new?section=${section}&prompt=${encodeURIComponent(q.question)}`}>Create an entry for this</Link>
                </Button>
              )}
            </li>
          ))}
        </ol>
      )}
      <p className="mt-4 text-[0.7rem] text-muted-foreground">Only entries marked Available are sent to Anthropic&apos;s Claude API for this.</p>
    </section>
  );
}
