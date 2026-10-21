"use client";

import { useState } from "react";
import { GitCompare, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ExemplarComparison } from "@/lib/ai/schemas";
import { postJson, toastApiError } from "@/lib/client/result";

export function CompareRunner({ ids, ready }: { ids: string[]; ready: boolean }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ExemplarComparison | null>(null);

  const run = async () => {
    setBusy(true);
    const res = await postJson<{ comparison: ExemplarComparison }>("/api/exemplars/compare", { idempotencyKey: crypto.randomUUID(), exemplarIds: ids });
    setBusy(false);
    if (!res.ok) return toastApiError(res.error);
    setResult(res.data.comparison);
  };

  return (
    <section aria-labelledby="cmp-h" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="cmp-h" className="font-heading text-lg font-semibold">
            AI comparison
          </h2>
          <p className="text-sm text-muted-foreground">Compares the saved analysis reports (not the essays&apos; full text).</p>
        </div>
        <Button onClick={() => void run()} disabled={busy || !ready}>
          {busy ? <Loader2 className="animate-spin" /> : <GitCompare />} {result ? "Compare again" : "Compare techniques"}
        </Button>
      </div>
      {!ready && <p className="text-sm text-muted-foreground">Analyse every selected exemplar first.</p>}
      {result && (
        <div className="grid gap-6 rounded-xl border bg-card p-5 lg:grid-cols-2">
          <div>
            <h3 className="mb-2 text-sm font-semibold">Shared techniques</h3>
            <ul className="reading space-y-2">
              {result.shared_techniques.map((t, i) => (
                <li key={i}>
                  <span className="font-medium">{t.technique}</span> <span className="text-sm text-muted-foreground">({t.exemplars.join(", ")})</span>
                  <div className="text-sm text-muted-foreground">{t.note}</div>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="mb-2 text-sm font-semibold">Alternative approaches</h3>
            <ul className="space-y-3">
              {result.differing_approaches.map((d, i) => (
                <li key={i}>
                  <div className="text-sm font-medium">{d.dimension}</div>
                  <ul className="reading mt-1 list-disc space-y-0.5 pl-5 text-[0.95rem]">
                    {d.approaches.map((a, j) => (
                      <li key={j}>
                        <span className="font-medium">{a.exemplar}:</span> {a.approach}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="mb-2 text-sm font-semibold">Recommendations</h3>
            <ul className="reading list-disc space-y-1 pl-5">
              {result.recommendations.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="mb-2 text-sm font-semibold">Caveats</h3>
            <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
              {result.caveats.map((c, i) => (
                <li key={i}>{c}</li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </section>
  );
}
