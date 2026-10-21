import { describe, expect, it } from "vitest";
import { runChecks, type CheckInput } from "@/lib/essay/checks";

const input = (paragraphs: string[], overrides: Partial<CheckInput> = {}): CheckInput => ({
  prompt: "Describe how you have demonstrated leadership and influencing skills in your community.",
  minWords: null,
  maxWords: 500,
  requiredThemes: ["leadership"],
  criteria: "",
  paragraphs: paragraphs.map((text, index) => ({ index, text })),
  evidenceText: "The club grew to 60 members.",
  exemplars: [],
  ...overrides,
});

const filler = (n: number) => Array.from({ length: n }, (_, i) => `word${i}`).join(" ");

describe("review finding generation", () => {
  it("flags word limits as critical", () => {
    const { findings, summary } = runChecks(input([`Leadership ${filler(520)}`]));
    expect(summary.wordState).toBe("over");
    expect(findings.find((f) => f.category === "word_count")).toMatchObject({ severity: "critical" });
  });

  it("flags unresolved placeholders as critical, linked to their paragraph", () => {
    const { findings } = runChecks(input(["I led the club.", "It grew to [ADD: number] members."]));
    const f = findings.find((x) => x.issue.includes("[ADD: number]"));
    expect(f).toMatchObject({ severity: "critical", label: "missing_evidence", blockIndex: 1 });
  });

  it("reports missing required themes and uncovered criteria", () => {
    const { findings, summary } = runChecks(
      input(["I enjoy cooking for friends and family on weekends."], { requiredThemes: ["leadership", "cooking"], criteria: "Networking with senior stakeholders\nCooking ability" }),
    );
    expect(summary).toMatchObject({ themesCovered: 1, themesTotal: 2, criteriaCovered: 1, criteriaTotal: 2 });
    expect(findings.some((f) => f.category === "required_themes" && f.requirement === "leadership")).toBe(true);
    expect(findings.some((f) => f.category === "selection_criteria" && f.requirement?.startsWith("Networking"))).toBe(true);
  });

  it("flags figures that are not in the recorded evidence, but not years or ones that are", () => {
    const { findings } = runChecks(input(["In 2022 the leadership club grew to 60 members and raised attendance by 45%."]));
    const unsupported = findings.filter((f) => f.category === "unsupported_claims").map((f) => f.excerpt);
    expect(unsupported).toEqual(["45%"]);
  });

  it("flags generic phrases and heavy repetition", () => {
    const text = `Since I was a child I have always been passionate about leadership. ${Array(6).fill("community").join(" and ")}.`;
    const { findings } = runChecks(input([text]));
    expect(findings.some((f) => f.category === "specificity" && f.excerpt === "since i was a child")).toBe(true);
    expect(findings.some((f) => f.category === "repetition" && f.excerpt === "community")).toBe(true);
  });

  it("flags passages copied from an exemplar as critical", () => {
    const exemplar = { title: "Sample", text: "Leadership begins with listening to the people who are most affected by a decision." };
    const { findings, summary } = runChecks(input(["For me, leadership begins with listening to the people who are most affected by a decision."], { exemplars: [exemplar] }));
    expect(summary.exemplarOverlapWords).toBeGreaterThanOrEqual(8);
    expect(findings.find((f) => f.category === "authenticity")).toMatchObject({ severity: "critical" });
  });

  it("gives findings stable IDs so dismissals survive a rerun", () => {
    const a = runChecks(input(["Since I was a child, leadership."])).findings.map((f) => f.id);
    const b = runChecks(input(["Since I was a child, leadership."])).findings.map((f) => f.id);
    expect(a).toEqual(b);
  });
});
