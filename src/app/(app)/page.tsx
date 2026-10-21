import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BookMarked, FolderPlus, LibraryBig, PenLine, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageContainer, SectionHeading } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { ApplicationCard, DeadlineText } from "@/components/application-card";
import { AnalysisBadge, StatusBadge } from "@/components/badges";
import { requireUser } from "@/lib/auth";
import { listApplications, type EssaySummary, ESSAY_SUMMARY_COLUMNS } from "@/server/queries";
import { ESSAY_TYPE_LABELS } from "@/lib/domain/constants";
import { formatDate, isUpcoming } from "@/lib/format/date";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const { supabase } = await requireUser();
  const [apps, profile, recentEssays, links, exemplars, storyCount] = await Promise.all([
    listApplications(supabase),
    supabase.from("profiles").select("display_name, full_name").maybeSingle<{ display_name: string | null; full_name: string | null }>(),
    supabase.from("essays").select(ESSAY_SUMMARY_COLUMNS).is("archived_at", null).order("updated_at", { ascending: false }).limit(5).returns<EssaySummary[]>(),
    supabase
      .from("essay_evidence_links")
      .select("created_at, entry_id, library_entries(id, title)")
      .not("entry_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(12)
      .returns<{ created_at: string; entry_id: string; library_entries: { id: string; title: string } | null }[]>(),
    supabase
      .from("exemplar_analyses")
      .select("completed_at, exemplar_id, exemplars(id, title, provenance)")
      .eq("status", "complete")
      .order("completed_at", { ascending: false })
      .limit(8)
      .returns<{ completed_at: string; exemplar_id: string; exemplars: { id: string; title: string } | null }[]>(),
    supabase.from("library_entries").select("id", { count: "exact", head: true }).is("archived_at", null),
  ]);

  const name = profile.data?.display_name || profile.data?.full_name?.split(" ")[0];
  const appName = new Map(apps.map((a) => [a.application.id, a.application.programme || a.application.name]));
  const continueEssay = recentEssays.data?.find((e) => e.status !== "submitted");
  const upcoming = apps
    .filter((a) => isUpcoming(a.application.deadline) && a.progress.status !== "submitted")
    .slice(0, 5);
  const recentStories = Array.from(new Map((links.data ?? []).flatMap((l) => (l.library_entries ? [[l.library_entries.id, l.library_entries]] : []))).values()).slice(0, 5);
  const recentExemplars = Array.from(new Map((exemplars.data ?? []).flatMap((x) => (x.exemplars ? [[x.exemplars.id, x]] : []))).values()).slice(0, 4);
  const firstRun = apps.length === 0 && (storyCount.count ?? 0) === 0;

  return (
    <PageContainer>
      <div className="mb-10 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-heading text-2xl font-semibold tracking-tight sm:text-[1.75rem]">{name ? `Welcome back, ${name}` : "Welcome to Essay Studio"}</h1>
          <p className="mt-1.5 max-w-xl text-sm text-muted-foreground">Build from evidence. Learn from exemplars. Write with purpose. Refine with intention.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {continueEssay && (
            <Button asChild variant="outline">
              <Link href={`/studio/${continueEssay.id}`}>
                <PenLine /> Continue writing
              </Link>
            </Button>
          )}
          <Button asChild>
            <Link href="/applications/new">
              <Plus /> Create application
            </Link>
          </Button>
        </div>
      </div>

      {firstRun ? (
        <section aria-labelledby="getting-started" className="rounded-xl border bg-card p-6 sm:p-8">
          <h2 id="getting-started" className="font-heading text-lg font-semibold">
            Getting started
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Strong essays come from specific, true material. Start by recording your evidence, then set up an application and its essay prompts.
          </p>
          <ol className="mt-6 grid gap-4 sm:grid-cols-3">
            {[
              { n: 1, title: "Build your Story Bank", text: "Record your background, education, projects, leadership and goals — facts and stories in your own words, with privacy you control.", href: "/library", cta: "Open the Story Bank" },
              { n: 2, title: "Create an application", text: "Record the opportunity, the exact essay prompts and word limits, and upload supporting documents.", href: "/applications/new", cta: "Create application" },
              { n: 3, title: "Learn from exemplars", text: "Optionally upload successful essays you may use, to analyse their techniques — never to copy them.", href: "/exemplars", cta: "Open library" },
            ].map((s) => (
              <li key={s.n} className="flex flex-col rounded-lg border bg-background p-4">
                <span className="text-xs font-medium text-ink">Step {s.n}</span>
                <h3 className="mt-1 text-sm font-semibold">{s.title}</h3>
                <p className="mt-1 flex-1 text-sm text-muted-foreground">{s.text}</p>
                <Button asChild variant="link" className="mt-2 h-auto self-start p-0">
                  <Link href={s.href}>
                    {s.cta} <ArrowRight />
                  </Link>
                </Button>
              </li>
            ))}
          </ol>
        </section>
      ) : (
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="space-y-10">
            <section>
              <SectionHeading
                title="Active applications"
                actions={
                  <Button asChild variant="ghost" size="sm">
                    <Link href="/applications">
                      All applications <ArrowRight />
                    </Link>
                  </Button>
                }
              />
              {apps.length === 0 ? (
                <EmptyState
                  icon={FolderPlus}
                  title="No applications yet"
                  description="Create an application to record its prompts, deadlines and requirements."
                  action={
                    <Button asChild>
                      <Link href="/applications/new">Create application</Link>
                    </Button>
                  }
                />
              ) : (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {apps.slice(0, 6).map((a) => (
                    <ApplicationCard key={a.application.id} item={a} />
                  ))}
                </div>
              )}
            </section>

            <section aria-labelledby="recent-essays">
              <h2 id="recent-essays" className="mb-3 text-sm font-semibold">
                Recent essays
              </h2>
              {recentEssays.data?.length ? (
                <ul className="divide-y rounded-xl border bg-card">
                  {recentEssays.data.map((e) => (
                    <li key={e.id}>
                      <Link href={`/studio/${e.id}`} className="flex items-center gap-3 px-4 py-3 outline-none hover:bg-muted/50 focus-visible:bg-muted/50">
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium">{e.title}</div>
                          <div className="truncate text-xs text-muted-foreground">
                            {appName.get(e.application_id)} · {ESSAY_TYPE_LABELS[e.essay_type]} · {e.word_count}
                            {e.max_words ? ` / ${e.max_words}` : ""} words
                          </div>
                        </div>
                        <StatusBadge status={e.status} />
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">Essays you work on will appear here.</p>
              )}
            </section>
          </div>

          <aside className="space-y-8">
            <section aria-labelledby="deadlines">
              <h2 id="deadlines" className="mb-3 text-sm font-semibold">
                Upcoming deadlines
              </h2>
              {upcoming.length ? (
                <ul className="space-y-2">
                  {upcoming.map(({ application: a }) => (
                    <li key={a.id} className="text-sm">
                      <Link href={`/applications/${a.id}`} className="font-medium hover:underline">
                        {a.programme || a.name}
                      </Link>
                      <div className="text-xs">
                        <DeadlineText deadline={a.deadline} />
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">No upcoming deadlines.</p>
              )}
            </section>

            <section aria-labelledby="recent-evidence">
              <h2 id="recent-evidence" className="mb-3 text-sm font-semibold">
                Recently used evidence
              </h2>
              {recentStories.length ? (
                <ul className="space-y-1.5">
                  {recentStories.map((s) => (
                    <li key={s.id}>
                      <Link href={`/library/entry/${s.id}`} className="text-sm hover:underline">
                        {s.title}
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">Story Bank entries you use in essays will appear here.</p>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                <Button asChild variant="outline" size="sm">
                  <Link href="/library">
                    <BookMarked /> Story Bank ({storyCount.count ?? 0})
                  </Link>
                </Button>
                <Button asChild variant="ghost" size="sm">
                  <Link href="/library/entry/new">
                    <Plus /> New entry
                  </Link>
                </Button>
              </div>
            </section>

            <section aria-labelledby="recent-exemplars">
              <h2 id="recent-exemplars" className="mb-3 text-sm font-semibold">
                Recently analysed exemplars
              </h2>
              {recentExemplars.length ? (
                <ul className="space-y-2">
                  {recentExemplars.map((x) => (
                    <li key={x.exemplar_id} className="flex items-center justify-between gap-2 text-sm">
                      <Link href={`/exemplars/${x.exemplar_id}`} className="truncate hover:underline">
                        {x.exemplars?.title}
                      </Link>
                      <span className="shrink-0 text-xs text-muted-foreground">{formatDate(x.completed_at, { day: "numeric", month: "short" })}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="space-y-2">
                  <AnalysisBadge value="not_started" />
                  <p className="text-sm text-muted-foreground">Analyse a successful essay to learn its techniques.</p>
                </div>
              )}
              <Button asChild variant="ghost" size="sm" className="mt-2">
                <Link href="/exemplars">
                  <LibraryBig /> Exemplar Library
                </Link>
              </Button>
            </section>
          </aside>
        </div>
      )}
    </PageContainer>
  );
}
