import { diffWords } from "diff";
import { cn } from "@/lib/utils";

/** Inline word-level diff: removed text struck through, added text highlighted. */
export function DiffView({ before, after, className }: { before: string; after: string; className?: string }) {
  const parts = diffWords(before, after);
  const changed = parts.some((p) => p.added || p.removed);
  return (
    <div className={cn("font-serif text-[0.95rem] leading-relaxed whitespace-pre-wrap", className)}>
      {!changed && <p className="mb-2 font-sans text-xs text-muted-foreground">No differences.</p>}
      {parts.map((p, i) =>
        p.added ? (
          <ins key={i} className="rounded-sm bg-emerald-100 text-emerald-950 no-underline dark:bg-emerald-950 dark:text-emerald-100">
            {p.value}
          </ins>
        ) : p.removed ? (
          <del key={i} className="rounded-sm bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-200">
            {p.value}
          </del>
        ) : (
          <span key={i}>{p.value}</span>
        ),
      )}
    </div>
  );
}

export function diffStats(before: string, after: string) {
  let added = 0;
  let removed = 0;
  for (const p of diffWords(before, after)) {
    const n = p.value.trim() ? p.value.trim().split(/\s+/).length : 0;
    if (p.added) added += n;
    if (p.removed) removed += n;
  }
  return { added, removed };
}
