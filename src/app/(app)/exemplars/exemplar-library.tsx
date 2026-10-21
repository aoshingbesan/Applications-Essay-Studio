"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { GitCompare, LibraryBig, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState } from "@/components/empty-state";
import { AnalysisBadge, ExtractionBadge, Pill, ProvenanceBadge, type AnalysisDisplay } from "@/components/badges";
import { ESSAY_TYPES, ESSAY_TYPE_LABELS, EXEMPLAR_PROVENANCE, PROVENANCE_LABELS, type EssayType, type ExemplarProvenance, type ExtractionStatus } from "@/lib/domain/constants";

export interface LibraryItem {
  id: string;
  title: string;
  essay_category: EssayType;
  institution: string | null;
  programme: string | null;
  application_year: number | null;
  provenance: ExemplarProvenance;
  tags: string[];
  word_count: number;
  extraction_status: ExtractionStatus;
  archived: boolean;
  analysis: AnalysisDisplay;
}

const ANY = "any";

export function ExemplarLibrary({ items }: { items: LibraryItem[] }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [type, setType] = useState(ANY);
  const [institution, setInstitution] = useState(ANY);
  const [programme, setProgramme] = useState(ANY);
  const [year, setYear] = useState(ANY);
  const [tag, setTag] = useState(ANY);
  const [provenance, setProvenance] = useState(ANY);
  const [analysis, setAnalysis] = useState(ANY);
  const [archived, setArchived] = useState(false);
  const [compare, setCompare] = useState<string[]>([]);

  const options = useMemo(() => {
    const uniq = (xs: (string | null)[]) => Array.from(new Set(xs.filter((x): x is string => Boolean(x)))).sort();
    return {
      institutions: uniq(items.map((i) => i.institution)),
      programmes: uniq(items.map((i) => i.programme)),
      years: uniq(items.map((i) => (i.application_year ? String(i.application_year) : null))).reverse(),
      tags: uniq(items.flatMap((i) => i.tags)),
    };
  }, [items]);

  const shown = items.filter(
    (i) =>
      i.archived === archived &&
      (!q.trim() || `${i.title} ${i.institution ?? ""} ${i.programme ?? ""} ${i.tags.join(" ")}`.toLowerCase().includes(q.trim().toLowerCase())) &&
      (type === ANY || i.essay_category === type) &&
      (institution === ANY || i.institution === institution) &&
      (programme === ANY || i.programme === programme) &&
      (year === ANY || String(i.application_year) === year) &&
      (tag === ANY || i.tags.includes(tag)) &&
      (provenance === ANY || i.provenance === provenance) &&
      (analysis === ANY || i.analysis === analysis),
  );

  const filter = (label: string, value: string, onChange: (v: string) => void, opts: [string, string][], width = "sm:w-44") => (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className={`w-full ${width}`} aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ANY}>{label}: any</SelectItem>
        {opts.map(([v, l]) => (
          <SelectItem key={v} value={v}>
            {l}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  if (items.length === 0) {
    return (
      <EmptyState
        icon={LibraryBig}
        title="No exemplars yet"
        description="Upload statements of purpose, scholarship essays, motivation letters or research statements you have permission to use. Record what you actually know about whether they were successful."
      />
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input aria-label="Search exemplars" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-8" />
        </div>
        {filter("Essay type", type, setType, ESSAY_TYPES.map((t) => [t, ESSAY_TYPE_LABELS[t]]), "sm:w-52")}
        {options.institutions.length > 0 && filter("Institution", institution, setInstitution, options.institutions.map((x) => [x, x]))}
        {options.programmes.length > 0 && filter("Programme", programme, setProgramme, options.programmes.map((x) => [x, x]))}
        {options.years.length > 0 && filter("Year", year, setYear, options.years.map((x) => [x, x]), "sm:w-32")}
        {options.tags.length > 0 && filter("Tag", tag, setTag, options.tags.map((x) => [x, x]), "sm:w-36")}
        {filter("Provenance", provenance, setProvenance, EXEMPLAR_PROVENANCE.map((p) => [p, PROVENANCE_LABELS[p]]), "sm:w-60")}
        {filter("Analysis", analysis, setAnalysis, [
          ["not_started", "Not analysed"],
          ["complete", "Analysed"],
          ["stale", "Out of date"],
          ["running", "Analysing"],
          ["failed", "Failed"],
        ], "sm:w-40")}
        <Button variant="ghost" onClick={() => setArchived((a) => !a)}>
          {archived ? "Show active" : "Show archived"}
        </Button>
      </div>

      {compare.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-ink/30 bg-accent/40 px-4 py-2.5 text-sm">
          <span>
            {compare.length} selected for comparison {compare.length < 2 && "— choose at least two analysed exemplars"}
          </span>
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={() => setCompare([])}>
              Clear
            </Button>
            <Button size="sm" disabled={compare.length < 2} onClick={() => router.push(`/exemplars/compare?ids=${compare.join(",")}`)}>
              <GitCompare /> Compare
            </Button>
          </div>
        </div>
      )}

      {shown.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">No exemplars match these filters.</p>
      ) : (
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {shown.map((x) => (
            <li key={x.id} className="relative flex flex-col gap-2 rounded-xl border bg-card p-4">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <Link href={`/exemplars/${x.id}`} className="font-heading text-[1.02rem] leading-snug font-semibold outline-none after:absolute after:inset-0 hover:underline">
                    {x.title}
                  </Link>
                  <div className="mt-0.5 truncate text-xs text-muted-foreground">
                    {ESSAY_TYPE_LABELS[x.essay_category]}
                    {x.institution ? ` · ${x.institution}` : ""}
                    {x.application_year ? ` · ${x.application_year}` : ""}
                  </div>
                </div>
                {x.analysis === "complete" && (
                  <Checkbox
                    className="relative z-10 mt-1"
                    aria-label={`Select ${x.title} for comparison`}
                    checked={compare.includes(x.id)}
                    onCheckedChange={(v) => setCompare((c) => (v === true ? [...c, x.id].slice(0, 5) : c.filter((id) => id !== x.id)))}
                  />
                )}
              </div>
              <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-1">
                <ProvenanceBadge value={x.provenance} />
                {x.extraction_status === "extracted" ? <AnalysisBadge value={x.analysis} /> : <ExtractionBadge value={x.extraction_status} />}
                {x.tags.slice(0, 3).map((t) => (
                  <Pill key={t}>{t}</Pill>
                ))}
                <span className="ml-auto text-xs text-muted-foreground">{x.word_count} words</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
