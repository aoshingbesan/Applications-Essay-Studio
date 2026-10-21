const STOPWORDS = new Set(
  `a about above after again against all also am an and any are as at be because been before being below between both but by can could did do does doing down during each few for from further had has have having he her here hers herself him himself his how i if in into is it its itself just me more most my myself no nor not now of off on once only or other our ours ourselves out over own same she should so some such than that the their theirs them themselves then there these they this those through to too under until up very was we were what when where which while who whom why will with would you your yours yourself yourselves
  able ability abilities applicant applicants candidate candidates demonstrate demonstrated demonstrates evidence example examples including include includes strong strength strengths skills skill show shows good well work working must also ensure etc within across using use used make made provide provides programme program course student students please essay essays applicant`.split(/\s+/),
);

function stem(word: string): string {
  return word
    .replace(/(?:ies)$/, "y")
    .replace(/(?:ing|edly|ed|ly|es|s)$/, "")
    .replace(/(.)\1$/, "$1");
}

/** Significant, stemmed keywords from free text. */
export function keywords(text: string): Set<string> {
  const out = new Set<string>();
  for (const raw of text.toLowerCase().match(/[a-z][a-z-]{2,}/g) ?? []) {
    if (STOPWORDS.has(raw) || raw.length < 4) continue;
    out.add(stem(raw));
  }
  return out;
}

export function overlap(a: Set<string>, b: Set<string>): string[] {
  return [...a].filter((w) => b.has(w));
}

/** Splits criteria or question lists written as lines, bullets or numbered items. */
export function splitItems(text: string): string[] {
  return text
    .split(/\r?\n|;|•/)
    .map((s) => s.replace(/^\s*(?:[-*–]|\d+[.)])\s*/, "").trim())
    .filter((s) => s.length > 3);
}
