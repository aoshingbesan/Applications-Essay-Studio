"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ExtractionBadge } from "@/components/badges";
import { OpenFileButton } from "@/components/file-upload";
import type { Exemplar } from "@/lib/domain/types";
import { replaceExemplarText } from "@/server/exemplars";
import { handleResult } from "@/lib/client/result";
import { countWords } from "@/lib/essay/doc";

/** The exemplar's text, read-only. Corrections (e.g. redaction) create a new text hash and invalidate analyses. */
export function SourceTextPanel({ exemplar }: { exemplar: Exemplar }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(exemplar.source_text);
  const [busy, setBusy] = useState(false);
  const hasText = exemplar.word_count > 0;

  return (
    <section aria-labelledby="source-h" className="rounded-xl border bg-card">
      <div className="flex items-center justify-between gap-2 border-b px-4 py-2.5">
        <h2 id="source-h" className="flex items-center gap-1.5 text-sm font-semibold">
          <Lock className="size-3.5 text-muted-foreground" aria-hidden /> Essay text
        </h2>
        <ExtractionBadge value={exemplar.extraction_status} />
      </div>
      <div className="space-y-3 p-4">
        {exemplar.extraction_error && (
          <Alert>
            <AlertDescription>{exemplar.extraction_error}</AlertDescription>
          </Alert>
        )}
        {hasText ? (
          <>
            <p className="text-xs text-muted-foreground">{exemplar.word_count} words · read-only reference. Check it for extraction errors before analysing.</p>
            <div className="max-h-[28rem] overflow-y-auto rounded-md border bg-paper p-3 font-serif text-sm leading-relaxed whitespace-pre-wrap select-text">{exemplar.source_text}</div>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">No readable text. Paste the essay text to analyse it.</p>
        )}
        <div className="flex flex-wrap gap-1">
          {exemplar.file_path && exemplar.file_name && <OpenFileButton path={exemplar.file_path} name={exemplar.file_name} />}
          <Dialog
            open={open}
            onOpenChange={(o) => {
              setOpen(o);
              if (o) setText(exemplar.source_text);
            }}
          >
            <DialogTrigger asChild>
              <Button variant="ghost" size="sm">
                {hasText ? "Correct or redact text" : "Paste text"}
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
              <DialogHeader>
                <DialogTitle>{hasText ? "Correct or redact the essay text" : "Paste the essay text"}</DialogTitle>
                <DialogDescription>
                  Fix extraction errors or remove other people&apos;s personal details. Saving new text marks existing analyses as out of date; they are never applied to text they did not analyse.
                </DialogDescription>
              </DialogHeader>
              <Textarea rows={18} className="font-serif" value={text} onChange={(e) => setText(e.target.value)} aria-label="Essay text" />
              <DialogFooter className="items-center gap-3">
                <span className="mr-auto text-xs text-muted-foreground">{countWords(text)} words</span>
                <Button
                  disabled={busy || countWords(text) < 50}
                  onClick={async () => {
                    setBusy(true);
                    const ok = handleResult(await replaceExemplarText(exemplar.id, text), "Text saved");
                    setBusy(false);
                    if (ok !== null) {
                      setOpen(false);
                      router.refresh();
                    }
                  }}
                >
                  Save text
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>
    </section>
  );
}
