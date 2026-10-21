import type { Metadata } from "next";
import Link from "next/link";
import { PenLine, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageContainer, PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { StatusBadge } from "@/components/badges";
import { requireUser } from "@/lib/auth";
import { listApplications } from "@/server/queries";
import { ESSAY_TYPE_LABELS } from "@/lib/domain/constants";
import { formatDate } from "@/lib/format/date";

export const metadata: Metadata = { title: "Essay Studio" };

export default async function StudioIndexPage() {
  const { supabase } = await requireUser();
  const apps = (await listApplications(supabase)).filter((a) => a.essays.some((e) => !e.archived_at));

  return (
    <PageContainer>
      <PageHeader title="Essay Studio" description="Choose an essay to open the writing workspace." />
      {apps.length === 0 ? (
        <EmptyState
          icon={PenLine}
          title="No essays to write yet"
          description="Create an application and add its essay questions; each one opens here as its own workspace."
          action={
            <Button asChild>
              <Link href="/applications/new">
                <Plus /> Create application
              </Link>
            </Button>
          }
        />
      ) : (
        <div className="space-y-8">
          {apps.map(({ application: a, essays }) => (
            <section key={a.id} aria-labelledby={`app-${a.id}`}>
              <h2 id={`app-${a.id}`} className="mb-2 text-sm font-semibold">
                {a.programme || a.name} <span className="font-normal text-muted-foreground">· {a.institution}</span>
              </h2>
              <ul className="divide-y rounded-xl border bg-card">
                {essays
                  .filter((e) => !e.archived_at)
                  .map((e) => (
                    <li key={e.id}>
                      <Link href={`/studio/${e.id}`} className="flex items-center gap-3 px-4 py-3 outline-none hover:bg-muted/50 focus-visible:bg-muted/50">
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium">{e.title}</div>
                          <div className="text-xs text-muted-foreground">
                            {ESSAY_TYPE_LABELS[e.essay_type]} · {e.word_count}
                            {e.max_words ? ` / ${e.max_words}` : ""} words · edited {formatDate(e.updated_at)}
                          </div>
                        </div>
                        <StatusBadge status={e.status} />
                      </Link>
                    </li>
                  ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </PageContainer>
  );
}
