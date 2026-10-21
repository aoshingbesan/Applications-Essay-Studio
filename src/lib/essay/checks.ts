// Deterministic readiness checks. They run without AI, instantly, on every review, and point the
// applicant at passages and requirements to look at. Heuristic and English-only: they cannot
// establish truth, and a passing check is not a prediction of any outcome.

import { createHash } from "node:crypto";
import { keywords, splitItems } from "@/lib/text/keywords";
import type { ReviewFinding } from "@/lib/domain/types";
import { findOverlaps } from "./overlap";
import { wordLimitStatus } from "./word-limit";

export interface CheckInput {
  prompt: string;
  minWords: number | null;
  maxWords: number | null;
  requiredThemes: string[];
  criteria: string;
  paragraphs: { index: number; text: string }[];
  /** Text of the evidence the applicant recorded; numbers in the essay should appear here. */
  evidenceText: string;
  exemplars: { title: string; text: string }[];
}

export interface CheckSummary {
  words: number;
  wordState: string;
  themesCovered: number;
  themesTotal: number;
  criteriaCovered: number;
  criteriaTotal: number;
  placeholders: number;
  exemplarOverlapWords: number;
}

const GENERIC_PHRASES = [
  "since i was a child",
  "from a young age",
  "i have always been passionate",
  "ever since i can remember",
  "in today's fast-paced world",
  "in today's world",
  "make a difference",
  "give back to my community",
  "a dream come true",
  "think outside the box",
  "hard-working and dedicated",
  "i am a perfect fit",
  "it is no secret",
  "dictionary defines",
  "change the world",
];

const PLACEHOLDER_RE = /\[(?:ADD|CONFIRM|TODO|TBC|INSERT)[^\]]*\]|\{\{[^}]+\}\}|\bTODO\b|\bTBC\b|\bXX+\b/g;
const NUMBER_RE = /(?:\b\d{1,3}(?:,\d{3})+|\b\d+(?:\.\d+)?)\s?(?:%|percent|per cent)?/g;

export function findingId(category: string, key: string): string {
  return `${category}:${createHash("sha1").update(key).digest("hex").slice(0, 10)}`;
}

function covers(text: Set<string>, item: string): boolean {
  const k = keywords(item);
  if (k.size === 0) return true;
  const hits = [...k].filter((w) => text.has(w)).length;
  // Short themes need one hit; longer criteria need a third of their significant words.
  return k.size <= 2 ? hits >= 1 : hits / k.size >= 1 / 3;
}

function paragraphOf(paragraphs: CheckInput["paragraphs"], needle: string): number | undefined {
  const n = needle.toLowerCase();
  return paragraphs.find((p) => p.text.toLowerCase().includes(n))?.index;
}

export function runChecks(input: CheckInput): { findings: ReviewFinding[]; summary: CheckSummary } {
  const text = input.paragraphs.map((p) => p.text).join("\n\n");
  const words = (text.trim().match(/[\p{L}\p{N}][\p{L}\p{N}'’.-]*/gu) ?? []).length;
  const lower = text.toLowerCase();
  const essayKeys = keywords(text);
  const findings: ReviewFinding[] = [];
  const add = (f: Omit<ReviewFinding, "id" | "source">, key: string) => findings.push({ ...f, id: findingId(f.category, key), source: "checks" });

  // Word count compliance.
  const limit = wordLimitStatus(words, input.minWords, input.maxWords);
  if (limit.state === "over" || (limit.state === "under" && input.minWords !== null && words < input.minWords)) {
    add(
      {
        category: "word_count",
        label: "needs_improvement",
        severity: "critical",
        issue: limit.message,
        why: "Essays outside the official word limit may be penalised or rejected.",
        requirement: [input.minWords !== null ? `Minimum ${input.minWords} words` : "", input.maxWords !== null ? `Maximum ${input.maxWords} words` : ""].filter(Boolean).join(", "),
        suggestion: limit.state === "over" ? "Use “Rewrite Within Word Limit” or cut the least essential sentences." : "Develop your strongest example further.",
      },
      "limit",
    );
  } else if (limit.state === "under") {
    add(
      {
        category: "word_count",
        label: "needs_improvement",
        severity: "optional",
        issue: limit.message,
        why: "Using much less than the available space can mean the answer is thin.",
        requirement: input.maxWords !== null ? `Maximum ${input.maxWords} words` : undefined,
        suggestion: "Consider adding depth — reflection, outcomes or programme fit — where it strengthens the answer.",
      },
      "short",
    );
  }

  // Unresolved placeholders.
  const placeholders = Array.from(new Set(text.match(PLACEHOLDER_RE) ?? []));
  for (const p of placeholders) {
    add(
      {
        category: "missing_requirements",
        label: "missing_evidence",
        severity: "critical",
        issue: `Unresolved placeholder ${p}`,
        why: "Placeholders mark information that is missing or needs your confirmation.",
        excerpt: p,
        suggestion: "Replace it with the real detail, or remove the sentence if you cannot support it.",
        blockIndex: paragraphOf(input.paragraphs, p),
      },
      p,
    );
  }

  // Required themes.
  let themesCovered = 0;
  for (const theme of input.requiredThemes) {
    if (covers(essayKeys, theme)) {
      themesCovered++;
      continue;
    }
    add(
      {
        category: "required_themes",
        label: "missing_evidence",
        severity: "critical",
        issue: `The required theme “${theme}” does not appear to be addressed`,
        why: "The official prompt lists this theme; essays that skip a required theme do not fully answer the question.",
        requirement: theme,
        suggestion: "Add a sentence or example that addresses this theme explicitly.",
      },
      theme,
    );
  }

  // Selection criteria.
  const criteria = splitItems(input.criteria);
  let criteriaCovered = 0;
  for (const c of criteria) {
    if (covers(essayKeys, c)) {
      criteriaCovered++;
      continue;
    }
    add(
      {
        category: "selection_criteria",
        label: "needs_improvement",
        severity: "optional",
        issue: `No clear evidence for the criterion “${c.slice(0, 120)}”`,
        why: "Selection panels look for evidence against each stated criterion.",
        requirement: c,
        suggestion: "If this criterion applies to this essay, connect one of your stories to it.",
      },
      c,
    );
  }

  // Prompt alignment (a weak signal: few of the prompt's key terms appear).
  const promptKeys = keywords(input.prompt);
  if (promptKeys.size >= 4 && words > 80) {
    const shared = [...promptKeys].filter((w) => essayKeys.has(w)).length;
    if (shared / promptKeys.size < 0.2) {
      add(
        {
          category: "prompt_alignment",
          label: "needs_improvement",
          severity: "optional",
          issue: "The draft shares few key terms with the prompt",
          why: "This can mean the essay drifts from the question being asked.",
          requirement: input.prompt.slice(0, 300),
          suggestion: "Check that each paragraph helps answer the exact prompt; run the AI review for a closer reading.",
        },
        "prompt",
      );
    }
  }

  // Numbers that do not appear anywhere in the recorded evidence.
  const evidenceNumbers = new Set((input.evidenceText.match(NUMBER_RE) ?? []).map((n) => n.replace(/[\s,]/g, "").toLowerCase()));
  const essayNumbers = Array.from(new Set(text.match(NUMBER_RE) ?? [])).filter((n) => {
    const v = n.replace(/[\s,]/g, "").toLowerCase();
    const num = Number.parseFloat(v);
    // Years and small counting numbers are rarely claims.
    return !(Number.isFinite(num) && ((num >= 1900 && num <= 2100 && !v.includes("%")) || (num <= 10 && !v.includes("%"))));
  });
  for (const n of essayNumbers) {
    const v = n.replace(/[\s,]/g, "").toLowerCase();
    if (evidenceNumbers.has(v)) continue;
    add(
      {
        category: "unsupported_claims",
        label: "missing_evidence",
        severity: "optional",
        issue: `“${n.trim()}” is not in your recorded evidence`,
        why: "Figures should be accurate and verifiable; unsupported numbers undermine credibility.",
        excerpt: n.trim(),
        suggestion: "Confirm the figure and record it in your Story Bank or profile, or remove it.",
        blockIndex: paragraphOf(input.paragraphs, n.trim()),
      },
      n,
    );
  }

  // Generic phrases.
  for (const phrase of GENERIC_PHRASES) {
    if (!lower.includes(phrase)) continue;
    add(
      {
        category: "specificity",
        label: "needs_improvement",
        severity: "optional",
        issue: `Generic phrase: “${phrase}”`,
        why: "Common stock phrases make an essay sound generic and use words that could carry evidence.",
        excerpt: phrase,
        suggestion: "Replace it with a specific detail from your own experience.",
        blockIndex: paragraphOf(input.paragraphs, phrase),
      },
      phrase,
    );
  }

  // Repetition: significant words used unusually often.
  const counts = new Map<string, number>();
  for (const w of lower.match(/[a-z][a-z'-]{5,}/g) ?? []) counts.set(w, (counts.get(w) ?? 0) + 1);
  const threshold = Math.max(5, Math.ceil(words / 90));
  const repeated = [...counts.entries()].filter(([, c]) => c >= threshold).sort((a, b) => b[1] - a[1]).slice(0, 3);
  for (const [w, c] of repeated) {
    add(
      {
        category: "repetition",
        label: "needs_improvement",
        severity: "optional",
        issue: `“${w}” is used ${c} times`,
        why: "Heavy repetition makes writing feel less precise.",
        excerpt: w,
        suggestion: "Vary the wording or use “Reduce Repetition” on the affected paragraphs.",
      },
      w,
    );
  }

  // Passages shared with attached exemplars.
  let exemplarOverlapWords = 0;
  for (const ex of input.exemplars) {
    const matches = findOverlaps(text, ex.text);
    for (const m of matches.slice(0, 5)) {
      exemplarOverlapWords += m.words;
      add(
        {
          category: "authenticity",
          label: "needs_improvement",
          severity: "critical",
          issue: `A ${m.words}-word passage matches the exemplar “${ex.title}”`,
          why: "Reproducing text from another applicant's essay is plagiarism and can disqualify an application.",
          excerpt: m.text.slice(0, 200),
          suggestion: "Rewrite this passage entirely in your own words, about your own experience.",
        },
        `${ex.title}:${m.text}`,
      );
    }
  }

  return {
    findings,
    summary: {
      words,
      wordState: limit.state,
      themesCovered,
      themesTotal: input.requiredThemes.length,
      criteriaCovered,
      criteriaTotal: criteria.length,
      placeholders: placeholders.length,
      exemplarOverlapWords,
    },
  };
}
