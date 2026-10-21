import { describe, expect, it } from "vitest";
import { countWords, docFromSections, docHeadings, docToPlainText, replaceBlock, sanitizeDoc, BlockConflictError, docFromParagraphs } from "@/lib/essay/doc";
import { wordLimitStatus, withinLimits } from "@/lib/essay/word-limit";
import { findOverlaps, overlapRatio } from "@/lib/essay/overlap";
import { applicationProgress, essayProgress } from "@/lib/domain/progress";

describe("word counting", () => {
  it("counts words, contractions, hyphenated and numeric tokens once each", () => {
    expect(countWords("")).toBe(0);
    expect(countWords("   ")).toBe(0);
    expect(countWords("I don't think well-being is 3.5 times harder.")).toBe(8);
    expect(countWords("Line one\nline two — with a dash")).toBe(7);
    expect(countWords("Café São Paulo naïve")).toBe(4);
  });

  it("counts the plain text of a document, including headings", () => {
    const doc = docFromSections([{ heading: "Motivation", paragraphs: ["First para here.", "Second para."] }], true);
    expect(docToPlainText(doc)).toBe("Motivation\n\nFirst para here.\n\nSecond para.");
    expect(countWords(docToPlainText(doc))).toBe(6);
    expect(docHeadings(doc)).toEqual([{ index: 0, level: 2, text: "Motivation" }]);
  });

  it("omits headings when not requested", () => {
    const doc = docFromSections([{ heading: "Hidden", paragraphs: ["Body."] }], false);
    expect(docToPlainText(doc)).toBe("Body.");
  });
});

describe("word-limit checks", () => {
  it("reports over, under, near and within", () => {
    expect(wordLimitStatus(0, null, 500).state).toBe("empty");
    expect(wordLimitStatus(510, null, 500)).toMatchObject({ state: "over", message: "10 words over the 500-word limit" });
    expect(wordLimitStatus(90, 100, 500)).toMatchObject({ state: "under", message: "10 words below the 100-word minimum" });
    expect(wordLimitStatus(480, null, 500).state).toBe("near");
    expect(wordLimitStatus(400, null, 500).state).toBe("within");
    expect(wordLimitStatus(200, null, 500).state).toBe("under");
    expect(wordLimitStatus(200, 100, 500).state).toBe("within");
    expect(wordLimitStatus(200, null, null)).toMatchObject({ state: "within", percent: null });
  });

  it("treats the limits as inclusive", () => {
    expect(withinLimits(500, null, 500)).toBe(true);
    expect(withinLimits(501, null, 500)).toBe(false);
    expect(withinLimits(100, 100, null)).toBe(true);
    expect(withinLimits(99, 100, null)).toBe(false);
  });
});

describe("exemplar overlap detection", () => {
  const exemplar = "When the river flooded our village in 2015 I learned that leadership begins with listening to the people who are most affected.";
  it("finds copied passages of eight or more words, ignoring case and punctuation", () => {
    const draft = "My story is different. leadership begins with listening to the people who are most affected, as I found.";
    const matches = findOverlaps(draft, exemplar);
    expect(matches).toHaveLength(1);
    expect(matches[0].text).toBe("leadership begins with listening to the people who are most affected");
    expect(matches[0].words).toBe(11);
    expect(overlapRatio(draft, matches)).toBeGreaterThan(0.5);
  });

  it("ignores short common phrases", () => {
    expect(findOverlaps("I learned that leadership matters to the people.", exemplar)).toEqual([]);
  });
});

describe("block replacement", () => {
  it("replaces only the target block and refuses stale edits", () => {
    const doc = docFromParagraphs(["One.", "Two.", "Three."]);
    const next = replaceBlock(doc, 1, "Two.", "Deux.\n\nZwei.");
    expect(docToPlainText(next)).toBe("One.\n\nDeux.\n\nZwei.\n\nThree.");
    expect(() => replaceBlock(doc, 1, "Changed meanwhile", "X")).toThrow(BlockConflictError);
  });

  it("sanitises stored documents to an allowlist", () => {
    const doc = sanitizeDoc({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "x", marks: [{ type: "link" }] }] }, { type: "script" }] });
    expect(doc).toEqual({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "x" }] }] });
  });
});

describe("progress derivation", () => {
  it("derives essay progress from status and length", () => {
    expect(essayProgress({ status: "not_started", word_count: 0, max_words: 500 })).toBe(0);
    expect(essayProgress({ status: "in_progress", word_count: 250, max_words: 500, outline_status: "approved" })).toBe(40);
    expect(essayProgress({ status: "ready_to_submit", word_count: 500, max_words: 500 })).toBe(95);
  });

  it("derives application status from its essays", () => {
    const ready = { status: "ready_to_submit" as const, word_count: 480, max_words: 500 };
    const draft = { status: "in_progress" as const, word_count: 100, max_words: 500 };
    const review = { status: "needs_review" as const, word_count: 450, max_words: 500 };
    expect(applicationProgress([], null)).toMatchObject({ status: "not_started", percent: 0 });
    expect(applicationProgress([ready, ready], null).status).toBe("ready_to_submit");
    expect(applicationProgress([ready, draft], null)).toMatchObject({ status: "in_progress", essaysReady: 1, essaysTotal: 2 });
    expect(applicationProgress([ready, review], null).status).toBe("needs_review");
    expect(applicationProgress([draft], "2026-01-01").status).toBe("submitted");
    expect(applicationProgress([{ ...draft, archived_at: "x" }], null).essaysTotal).toBe(0);
  });
});

describe("empty editor documents", () => {
  it("treats a document without a content array as empty", async () => {
    const { asDoc, docToPlainText, sanitizeDoc, docHeadings } = await import("@/lib/essay/doc");
    expect(asDoc({ type: "doc" })).toEqual({ type: "doc", content: [] });
    expect(docToPlainText({ type: "doc" } as never)).toBe("");
    expect(docHeadings({ type: "doc" } as never)).toEqual([]);
    expect(sanitizeDoc({ type: "doc" })).toEqual({ type: "doc", content: [] });
    expect(sanitizeDoc({ type: "doc", content: "x" })).toBeNull();
  });
});
