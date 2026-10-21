import type { Metadata } from "next";
import Link from "next/link";
import { ListChecks, Lock, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageContainer, PageHeader } from "@/components/page-header";
import { ClassificationBadge, Pill, PrivacyBadge } from "@/components/badges";
import { requireUser } from "@/lib/auth";
import { SECTIONS, sectionTitle, type EntrySection, type Privacy } from "@/lib/library/sections";
import type { LibraryEntry } from "@/lib/domain/types";
import { ImportFromLetterStudio } from "./import-dialog";

export const metadata: Metadata = { title: "Story Bank" };

type Row = Pick<LibraryEntry, "id" | "section" | "also_in" | "title" | "privacy" | "classification" | "organisation" | "period">;

export default async function LibraryPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { supabase } = await requireUser();
  const q = (await searchParams).q?.trim().slice(0, 200) ?? "";
  const [{ data: entries }, { data: settings }, { count: docCount }, results] = await Promise.all([
    supabase.from("library_entries").select("id, section, also_in, privacy").is("archived_at", null).returns<Pick<LibraryEntry, "id" | "section" | "also_in" | "privacy">[]>(),
    supabase.from("library_section_settings").select("section, default_privacy").returns<{ section: EntrySection; default_privacy: Privacy }[]>(),
    supabase.from("supporting_documents").select("id", { count: "exact", head: true }),
    q
      ? supabase
          .from("library_entries")
          .select("id, section, also_in, title, privacy, classification, organisation, period")
          .is("archived_at", null)
          .textSearch("search_vector", q, { type: "websearch", config: "english" })
          .limit(50)
          .returns<Row[]>()
      : Promise.resolve({ data: null as Row[] | null }),
  ]);

  const all = entries ?? [];
  const countIn = (key: string) => all.filter((e) => e.section === key || e.also_in.includes(key as EntrySection)).length;
  const withheld = (key: string) => all.filter((e) => (e.section === key || e.also_in.includes(key as EntrySection)) && e.privacy !== "available").length;
  const defaultFor = (key: string, fallback: Privacy) => settings?.find((s) => s.section === key)?.default_privacy ?? fallback;

  return (
    <PageContainer wide>
      <PageHeader
        title="Story Bank"
        description="Your personal evidence library. Record facts and stories once, in your own words; each essay draws only on what is relevant — and only on what you have made available."
        actions={
          <>
            <ImportFromLetterStudio />
            <Button asChild variant="outline">
              <Link href="/library/facts">
                <ListChecks /> Key facts
              </Link>
            </Button>
            <Button asChild>
              <Link href="/library/entry/new">
                <Plus /> New entry
              </Link>
            </Button>
          </>
        }
      />

      <form role="search" action="/library" className="relative mb-6 max-w-md">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input name="q" defaultValue={q} aria-label="Search the Story Bank" placeholder="Search all sections…" className="pl-8" />
      </form>

      {q && (
        <section aria-labelledby="results-h" className="mb-10">
          <h2 id="results-h" className="mb-3 text-sm font-semibold">
            {results.data?.length ?? 0} result{results.data?.length === 1 ? "" : "s"} for “{q}”{" "}
            <Link href="/library" className="ml-2 font-normal text-ink hover:underline">
              Clear
            </Link>
          </h2>
          <ul className="divide-y rounded-xl border bg-card">
            {(results.data ?? []).map((e) => (
              <li key={e.id}>
                <Link href={`/library/entry/${e.id}`} className="flex flex-wrap items-center gap-2 px-4 py-3 hover:bg-muted/50">
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{e.title}</span>
                  <span className="text-xs text-muted-foreground">{sectionTitle(e.section)}</span>
                  <ClassificationBadge value={e.classification} />
                  <PrivacyBadge value={e.privacy} />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <ol className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {SECTIONS.map((s) => {
          const isDocs = s.key === "documents";
          const n = isDocs ? (docCount ?? 0) : countIn(s.key);
          const hidden = isDocs ? 0 : withheld(s.key);
          return (
            <li key={s.key}>
              <Link
                href={isDocs ? "/documents" : `/library/${s.key}`}
                className="group flex h-full min-w-0 flex-col gap-2 rounded-xl border bg-card p-4 outline-none hover:border-foreground/20 focus-visible:ring-2 focus-visible:ring-ring"
              >
                <div className="flex items-baseline gap-2">
                  <span className="font-mono text-xs text-muted-foreground">{s.number}</span>
                  <h2 className="font-heading text-[1.02rem] leading-snug font-semibold group-hover:underline">{s.title}</h2>
                </div>
                <p className="text-sm text-muted-foreground">{s.description}</p>
                <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-1 text-xs text-muted-foreground">
                  <Pill>
                    {n} {isDocs ? (n === 1 ? "document" : "documents") : n === 1 ? "entry" : "entries"}
                  </Pill>
                  {!isDocs && <PrivacyBadge value={defaultFor(s.key, s.defaultPrivacy)} />}
                  {hidden > 0 && (
                    <span className="inline-flex items-center gap-1">
                      <Lock className="size-3" aria-hidden /> {hidden} not freely available to the AI
                    </span>
                  )}
                  {n === 0 && !isDocs && <span>Start here →</span>}
                </div>
              </Link>
            </li>
          );
        })}
      </ol>
    </PageContainer>
  );
}
