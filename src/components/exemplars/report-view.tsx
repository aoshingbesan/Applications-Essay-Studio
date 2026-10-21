import type { ExemplarReport } from "@/lib/ai/schemas";
import { Pill } from "@/components/badges";
import { cn } from "@/lib/utils";

const BASIS_LABEL = { observed: "Observation", interpreted: "Interpretation", recommended: "Recommendation" } as const;
const BASIS_TONE = {
  observed: "bg-muted text-muted-foreground ring-border",
  interpreted: "bg-violet-50 text-violet-800 ring-violet-200 dark:bg-violet-950 dark:text-violet-200 dark:ring-violet-900",
  recommended: "bg-sky-50 text-sky-800 ring-sky-200 dark:bg-sky-950 dark:text-sky-200 dark:ring-sky-900",
} as const;

export const REPORT_SECTIONS = [
  ["overview", "A. Overview"],
  ["opening", "B. Opening"],
  ["structure", "C. Structure and narrative"],
  ["evidence", "D. Evidence and credibility"],
  ["alignment", "E. Prompt alignment"],
  ["techniques", "F. Writing techniques"],
  ["limitations", "G. Limitations"],
  ["lessons", "H. Transferable lessons"],
  ["blueprint", "I. Writing blueprint"],
] as const;

function Section({ id, title, kind, children }: { id: string; title: string; kind: "Observations" | "Interpretation" | "Recommendations" | "Mixed"; children: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="scroll-mt-24 border-t pt-6">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 id={`${id}-h`} className="font-heading text-lg font-semibold">
          {title}
        </h2>
        <span className="text-xs text-muted-foreground">{kind}</span>
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function Item({ label, children }: { label: string; children: React.ReactNode }) {
  if (children === "" || children === null || children === undefined) return null;
  return (
    <div>
      <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{label}</h3>
      <div className="reading mt-0.5">{children}</div>
    </div>
  );
}

function List({ items, empty }: { items: string[]; empty?: string }) {
  if (!items.length) return empty ? <p className="text-sm text-muted-foreground">{empty}</p> : null;
  return (
    <ul className="reading list-disc space-y-1 pl-5">
      {items.map((x, i) => (
        <li key={i}>{x}</li>
      ))}
    </ul>
  );
}

function Shares({ rows }: { rows: { label: string; share: number; note?: string }[] }) {
  const total = rows.reduce((a, r) => a + Math.max(0, r.share), 0) || 1;
  return (
    <div className="space-y-1.5">
      {rows.map((r, i) => (
        <div key={i} className="grid grid-cols-[minmax(0,10rem)_1fr_3rem] items-center gap-3 text-sm">
          <span className="truncate">{r.label}</span>
          <span className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
            <span className="block h-full rounded-full bg-ink/70" style={{ width: `${(Math.max(0, r.share) / total) * 100}%` }} />
          </span>
          <span className="text-right text-xs text-muted-foreground tabular-nums">~{r.share}%</span>
        </div>
      ))}
    </div>
  );
}

/** The structured exemplar analysis report (sections A–I). */
export function ReportView({ report, className }: { report: ExemplarReport; className?: string }) {
  const r = report;
  const totalWords = r.structure.sections.reduce((a, s) => a + s.approx_words, 0) || 1;
  return (
    <div className={cn("space-y-8", className)}>
      <Section id="overview" title="A. Overview" kind="Observations">
        <Item label="Purpose">{r.overview.purpose}</Item>
        <Item label="Main argument">{r.overview.main_argument}</Item>
        <Item label="Central narrative">{r.overview.central_narrative}</Item>
        <Item label="Structure">{r.overview.structure_summary}</Item>
        <div className="flex flex-wrap gap-1.5">
          {r.overview.themes.map((t) => (
            <Pill key={t}>{t}</Pill>
          ))}
          <span className="text-xs text-muted-foreground">≈ {r.overview.approx_word_count} words</span>
        </div>
      </Section>

      <Section id="opening" title="B. Opening analysis" kind="Mixed">
        <Item label={`How it begins · ${r.opening.opening_type.replace(/_/g, " ")}`}>{r.opening.how_it_begins}</Item>
        <Item label="Establishing motivation">{r.opening.motivation_effectiveness}</Item>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Item label="What works well">
            <List items={r.opening.works_well} />
          </Item>
          <Item label="What could be improved">
            <List items={r.opening.could_improve} />
          </Item>
        </div>
      </Section>

      <Section id="structure" title="C. Structure and narrative" kind="Mixed">
        <ol className="space-y-2">
          {r.structure.sections.map((s, i) => (
            <li key={i} className="rounded-lg border bg-background p-3">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm font-medium">
                  {i + 1}. {s.label}
                </span>
                <span className="text-xs text-muted-foreground tabular-nums">≈ {s.approx_words} words ({Math.round((s.approx_words / totalWords) * 100)}%)</span>
              </div>
              <p className="reading mt-1 text-[0.95rem]">{s.summary}</p>
              <p className="mt-1 text-xs text-muted-foreground">Purpose: {s.purpose}</p>
            </li>
          ))}
        </ol>
        <Item label="Progression of ideas">{r.structure.progression}</Item>
        <Item label="Balance">
          <Shares rows={r.structure.balance.map((b) => ({ label: b.component, share: b.approx_share_percent }))} />
          <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
            {r.structure.balance.filter((b) => b.comment).map((b, i) => (
              <li key={i}>
                <span className="font-medium text-foreground">{b.component}:</span> {b.comment}
              </li>
            ))}
          </ul>
        </Item>
        <Item label="Transitions">{r.structure.transitions}</Item>
        <Item label="Conclusion strategy">{r.structure.conclusion_strategy}</Item>
      </Section>

      <Section id="evidence" title="D. Evidence and credibility" kind="Mixed">
        <Item label="How claims are supported">{r.evidence.support_methods}</Item>
        <Item label="Contextualising achievements">{r.evidence.contextualisation}</Item>
        <Item label="Measurable outcomes">{r.evidence.measurable_outcomes}</Item>
        <Item label="Reflection and learning">{r.evidence.reflection}</Item>
        <Item label="Specificity">{r.evidence.specificity}</Item>
        <Item label="Unsupported or generic claims">
          <List items={r.evidence.unsupported_claims} empty="None identified." />
        </Item>
      </Section>

      <Section id="alignment" title="E. Prompt and selection-criteria alignment" kind="Interpretation">
        {r.alignment.note && <p className="text-sm text-muted-foreground">{r.alignment.note}</p>}
        {r.alignment.available && r.alignment.items.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr>
                  <th className="py-2 pr-3 font-medium">Requirement</th>
                  <th className="py-2 pr-3 font-medium">How it is addressed</th>
                  <th className="py-2 pr-3 font-medium">Evidence</th>
                  <th className="py-2 font-medium">Gaps</th>
                </tr>
              </thead>
              <tbody className="divide-y align-top">
                {r.alignment.items.map((a, i) => (
                  <tr key={i}>
                    <td className="py-2 pr-3 font-medium">{a.requirement}</td>
                    <td className="py-2 pr-3">{a.how_addressed}</td>
                    <td className="py-2 pr-3">{a.evidence}</td>
                    <td className="py-2">{a.gaps}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Section id="techniques" title="F. Writing techniques" kind="Mixed">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Item label="Tone and voice">{r.techniques.tone_voice}</Item>
          <Item label="Sentence variety">{r.techniques.sentence_variety}</Item>
          <Item label="Paragraph structure">{r.techniques.paragraph_structure}</Item>
          <Item label="Specificity">{r.techniques.specificity}</Item>
          <Item label="Clarity">{r.techniques.clarity}</Item>
          <Item label="Transitions">{r.techniques.transitions}</Item>
          <Item label="Storytelling">{r.techniques.storytelling}</Item>
          <Item label="Argument development">{r.techniques.argument_development}</Item>
          <Item label="Narrative and explanation">{r.techniques.narrative_explanation_balance}</Item>
        </div>
        {r.techniques.rhetorical_techniques.length > 0 && (
          <Item label="Rhetorical techniques">
            <ul className="space-y-1">
              {r.techniques.rhetorical_techniques.map((t, i) => (
                <li key={i}>
                  <span className="font-medium">{t.technique}</span> — {t.observation}
                </li>
              ))}
            </ul>
          </Item>
        )}
      </Section>

      <Section id="limitations" title="G. Limitations" kind="Interpretation">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Item label="Weak or generic sections">
            <List items={r.limitations.weak_sections} empty="None identified." />
          </Item>
          <Item label="Potential overstatement">
            <List items={r.limitations.overstatement} empty="None identified." />
          </Item>
          <Item label="Missing evidence">
            <List items={r.limitations.missing_evidence} empty="None identified." />
          </Item>
          <Item label="Unclear reasoning">
            <List items={r.limitations.unclear_reasoning} empty="None identified." />
          </Item>
          <Item label="May not transfer">
            <List items={r.limitations.non_transferable} empty="None identified." />
          </Item>
        </div>
        <p className="rounded-lg border border-dashed px-3 py-2 text-sm text-muted-foreground">{r.limitations.single_sample_caveat}</p>
      </Section>

      <Section id="lessons" title="H. Transferable lessons" kind="Mixed">
        <ul className="space-y-2">
          {r.lessons.map((l, i) => (
            <li key={i} className="rounded-lg border bg-background p-3">
              <div className="flex flex-wrap items-center gap-2">
                <Pill tone={BASIS_TONE[l.basis]}>{BASIS_LABEL[l.basis]}</Pill>
                <span className="text-xs text-muted-foreground capitalize">{l.aspect}</span>
              </div>
              <p className="reading mt-1.5 font-medium">{l.lesson}</p>
              <p className="mt-1 text-sm text-muted-foreground">{l.rationale}</p>
            </li>
          ))}
        </ul>
      </Section>

      <Section id="blueprint" title="I. Writing blueprint" kind="Recommendations">
        <Item label="Recommended opening strategy">{r.blueprint.opening_strategy}</Item>
        <Item label="Suggested structure and word allocation">
          <Shares rows={r.blueprint.structure.map((s) => ({ label: s.section, share: s.approx_share_percent }))} />
          <ul className="mt-2 space-y-1 text-sm">
            {r.blueprint.structure.map((s, i) => (
              <li key={i}>
                <span className="font-medium">{s.section}:</span> <span className="text-muted-foreground">{s.purpose}</span>
              </li>
            ))}
          </ul>
        </Item>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Item label="Questions to answer about yourself">
            <List items={r.blueprint.questions_for_applicant} />
          </Item>
          <Item label="Evidence you will need">
            <List items={r.blueprint.evidence_needed} />
          </Item>
        </div>
        <Item label="Balance">{r.blueprint.balance_guidance}</Item>
        <Item label="Weaknesses to avoid">
          <List items={r.blueprint.weaknesses_to_avoid} />
        </Item>
      </Section>
    </div>
  );
}
