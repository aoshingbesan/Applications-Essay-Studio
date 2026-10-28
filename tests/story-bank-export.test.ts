import { describe, expect, it } from "vitest";
import { storyBankPieces } from "@/lib/library/export";
import { DEFAULT_EXPORT_OPTIONS, exportPdf, exportText } from "@/lib/essay/export";
import { entries } from "./fixtures";

const text = (scope: Parameters<typeof storyBankPieces>[1]) => exportText(storyBankPieces(entries, scope), { includeTitles: true, cover: null });

describe("Story Bank export", () => {
  it("groups entries under their section, in section order, with the story fields", () => {
    const pieces = storyBankPieces(entries, "all");
    expect(pieces.map((p) => p.title.slice(0, 2))).toEqual(["01", "02", "04", "08", "12"]);
    const out = text("all");
    expect(out).toContain("Founded a community coding club");
    expect(out).toContain("What I did: Negotiated free use of the library");
    expect(out).toContain("I still remember the first session");
  });

  it("includes Private entries only when everything is requested", () => {
    expect(text("all")).toContain("SENSITIVE-PRIVATE-DETAIL");
    expect(text("shareable")).not.toContain("SENSITIVE-PRIVATE-DETAIL");
    expect(text("shareable")).toContain("SENSITIVE-ASK-DETAIL");
    expect(text("available")).not.toContain("SENSITIVE-ASK-DETAIL");
  });

  it("leaves out archived entries", () => {
    const archived = entries.map((e) => ({ ...e, archived_at: "2026-01-01" }));
    expect(storyBankPieces(archived, "all")).toEqual([]);
  });

  it("renders a PDF", async () => {
    const pdf = await exportPdf(storyBankPieces(entries, "all"), { ...DEFAULT_EXPORT_OPTIONS, documentTitle: "Story Bank", includeTitles: true, cover: { title: "Story Bank", subtitle: "All entries · 28 October 2026" } });
    expect(new TextDecoder().decode(pdf.slice(0, 5))).toBe("%PDF-");
    expect(pdf.length).toBeGreaterThan(2000);
  });
});
