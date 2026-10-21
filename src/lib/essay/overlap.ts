// Detects passages copied from an exemplar: any run of `n` or more consecutive words that also
// appears in the exemplar text. Used to warn before a draft reproduces a model essay.

function normaliseWords(text: string): string[] {
  return (
    text
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[’‘]/g, "'")
      .match(/[\p{L}\p{N}']+/gu) ?? []
  );
}

export interface OverlapMatch {
  /** The shared passage as it appears (normalised) in the draft. */
  text: string;
  words: number;
}

/** Shared passages of at least `n` consecutive words, merged into maximal runs, longest first. */
export function findOverlaps(draft: string, source: string, n = 8): OverlapMatch[] {
  const a = normaliseWords(draft);
  const b = normaliseWords(source);
  if (a.length < n || b.length < n) return [];
  const shingles = new Set<string>();
  for (let i = 0; i + n <= b.length; i++) shingles.add(b.slice(i, i + n).join(" "));

  const hit = new Array<boolean>(a.length).fill(false);
  for (let i = 0; i + n <= a.length; i++) {
    if (shingles.has(a.slice(i, i + n).join(" "))) for (let j = i; j < i + n; j++) hit[j] = true;
  }
  const matches: OverlapMatch[] = [];
  let start = -1;
  for (let i = 0; i <= a.length; i++) {
    if (i < a.length && hit[i]) {
      if (start < 0) start = i;
    } else if (start >= 0) {
      matches.push({ text: a.slice(start, i).join(" "), words: i - start });
      start = -1;
    }
  }
  return matches.sort((x, y) => y.words - x.words);
}

/** Share of the draft's words that sit inside copied passages (0–1). */
export function overlapRatio(draft: string, matches: OverlapMatch[]): number {
  const total = normaliseWords(draft).length;
  if (total === 0) return 0;
  return Math.min(1, matches.reduce((acc, m) => acc + m.words, 0) / total);
}
