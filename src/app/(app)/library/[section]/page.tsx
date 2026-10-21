import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Archive, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { PageContainer, PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { ClassificationBadge, Pill, PrivacyBadge } from "@/components/badges";
import { requireUser } from "@/lib/auth";
import { isAiConfigured } from "@/lib/ai/client";
import { ENTRY_SECTIONS, SECTION_BY_KEY, sectionTitle, type EntrySection, type Privacy } from "@/lib/library/sections";
import type { LibraryEntry } from "@/lib/domain/types";
import { SectionPrivacy } from "./section-privacy";
import { GuidedQuestions } from "./guided-questions";

export async function generateMetadata({ params }: { params: Promise<{ section: string }> }): Promise<Metadata> {
  const { section } = await params;
  return { title: SECTION_BY_KEY[section as EntrySection]?.title ?? "Story Bank" };
}

export default async function SectionPage({ params, searchParams }: { params: Promise<{ section: string }>; searchParams: Promise<{ archived?: string }> }) {
  const { section } = await params;
  if (section === "documents") redirect("/documents");
  if (!(ENTRY_SECTIONS as readonly string[]).includes(section)) notFound();
  const key = section as EntrySection;
  const def = SECTION_BY_KEY[key];
  const showArchived = (await searchParams).archived === "1";
  const { supabase } = await requireUser();

  const [{ data: entries }, { data: setting }, { data: links }, { data: profile }] = await Promise.all([
    supabase
      .from("library_entries")
      .select("*")
      .or(`section.eq.${key},also_in.cs.{${key}}`)
      .order("position")
      .order("updated_at", { ascending: false })
      .returns<LibraryEntry[]>(),
    supabase.from("library_section_settings").select("default_privacy").eq("section", key).maybeSingle<{ default_privacy: Privacy }>(),
    supabase.from("essay_evidence_links").select("entry_id").not("entry_id", "is", null).returns<{ entry_id: string }[]>(),
    supabase.from("profiles").select("ai_enabled").maybeSingle<{ ai_enabled: boolean }>(),
  ]);
  const visible = (entries ?? []).filter((e) => (showArchived ? e.archived_at : !e.archived_at));
  const archivedCount = (entries ?? []).filter((e) => e.archived_at).length;
  const uses = new Map<string, number>();
  for (const l of links ?? []) uses.set(l.entry_id, (uses.get(l.entry_id) ?? 0) + 1);
  const defaultPrivacy = setting?.default_privacy ?? def.defaultPrivacy;
  const aiReason = !isAiConfigured() ? "AI is not configured on this server." : profile && !profile.ai_enabled ? "AI features are switched off in Settings." : null;

  return (
    <PageContainer wide>
      <PageHeader
        back={{ href: "/library", label: "Story Bank" }}
        eyebrow={`Section ${def.number}`}
        title={def.title}
        description={def.description}
        actions={
          <Button asChild>
            <Link href={`/library/entry/new?section=${key}`}>
              <Plus /> Add entry
            </Link>
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-6">
          {def.note && (
            <Alert>
              <AlertDescription>{def.note}</AlertDescription>
            </Alert>
          )}

          {visible.length === 0 ? (
            <EmptyState
              icon={showArchived ? Archive : Plus}
              title={showArchived ? "No archived entries" : "Nothing recorded yet"}
              description={showArchived ? "Archived entries are kept but never used in essays." : "Add an entry for each experience, fact or goal in this area. Short and specific is fine; you can expand it later."}
              action={
                showArchived ? undefined : (
                  <Button asChild>
                    <Link href={`/library/entry/new?section=${key}`}>Add the first entry</Link>
                  </Button>
                )
              }
            />
          ) : (
            <ul className="space-y-2">
              {visible.map((e) => (
                <li key={e.id}>
                  <Link href={`/library/entry/${e.id}`} className="block rounded-xl border bg-card p-4 outline-none hover:border-foreground/20 focus-visible:ring-2 focus-visible:ring-ring">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <h2 className="font-heading text-[1.02rem] leading-snug font-semibold">{e.title}</h2>
                      <div className="flex flex-wrap gap-1.5">
                        <ClassificationBadge value={e.classification} />
                        <PrivacyBadge value={e.privacy} />
                      </div>
                    </div>
                    {[e.role, e.organisation, e.period].some(Boolean) && <p className="mt-1 text-sm text-muted-foreground">{[e.role, e.organisation, e.period].filter(Boolean).join(" · ")}</p>}
                    {(e.summary || e.narrative || e.outcome) && <p className="mt-1.5 line-clamp-2 text-sm">{e.summary || e.outcome || e.narrative}</p>}
                    <div className="mt-2 flex flex-wrap gap-1.5 text-xs text-muted-foreground">
                      {e.section !== key && <Pill>Also in {sectionTitle(e.section)}</Pill>}
                      {e.section === key && e.also_in.length > 0 && <Pill>Also in {e.also_in.map(sectionTitle).join(", ")}</Pill>}
                      {e.narrative && <Pill>Has narrative</Pill>}
                      {uses.get(e.id) ? <span>Used in {uses.get(e.id)} essay{uses.get(e.id) === 1 ? "" : "s"}</span> : null}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {(archivedCount > 0 || showArchived) && (
            <Button asChild variant="ghost" size="sm">
              <Link href={showArchived ? `/library/${key}` : `/library/${key}?archived=1`}>{showArchived ? "Show current entries" : `Show ${archivedCount} archived`}</Link>
            </Button>
          )}
        </div>

        <aside className="space-y-6">
          <SectionPrivacy section={key} value={defaultPrivacy} entryCount={(entries ?? []).filter((e) => e.section === key).length} />
          <section aria-labelledby="guide-h" className="rounded-xl border bg-card p-4">
            <h2 id="guide-h" className="text-sm font-semibold">
              What to record here
            </h2>
            <ul className="mt-2 list-disc space-y-1 pl-4 text-sm text-muted-foreground">
              {def.prompts.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-muted-foreground">You don&apos;t need to complete every section before writing. Essays draw on whatever is relevant, and ask you when something important is missing.</p>
          </section>
          <GuidedQuestions section={key} sectionTitle={def.title} entries={visible.filter((e) => !e.archived_at).map((e) => ({ id: e.id, title: e.title, privacy: e.privacy }))} aiUnavailableReason={aiReason} />
        </aside>
      </div>
    </PageContainer>
  );
}
