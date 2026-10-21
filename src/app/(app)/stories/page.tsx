import type { Metadata } from "next";
import Link from "next/link";
import { BookMarked, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageContainer, PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { Pill, VerificationBadge } from "@/components/badges";
import { requireUser } from "@/lib/auth";
import { STORY_VERIFICATION, type StoryVerification } from "@/lib/domain/constants";
import type { Story } from "@/lib/domain/types";
import { StoryFilters } from "./story-filters";
import { ImportFromLetterStudio } from "./import-dialog";

export const metadata: Metadata = { title: "Story Bank" };

export default async function StoriesPage({ searchParams }: { searchParams: Promise<{ q?: string; tag?: string; status?: string; archived?: string }> }) {
  const { supabase } = await requireUser();
  const sp = await searchParams;
  const archived = sp.archived === "1";
  let query = supabase.from("story_bank_items").select("*").order("updated_at", { ascending: false }).limit(200);
  query = archived ? query.not("archived_at", "is", null) : query.is("archived_at", null);
  if (sp.q?.trim()) query = query.textSearch("search_vector", sp.q.trim().slice(0, 200), { type: "websearch", config: "english" });
  if (sp.tag) query = query.contains("tags", [sp.tag]);
  if (sp.status && (STORY_VERIFICATION as readonly string[]).includes(sp.status)) query = query.eq("verification_status", sp.status as StoryVerification);
  const [{ data: stories }, { data: allTags }, { data: usage }] = await Promise.all([
    query.returns<Story[]>(),
    supabase.from("story_bank_items").select("tags").is("archived_at", null).returns<{ tags: string[] }[]>(),
    supabase.from("essay_evidence_links").select("story_id").not("story_id", "is", null).returns<{ story_id: string }[]>(),
  ]);
  const tags = Array.from(new Set((allTags ?? []).flatMap((t) => t.tags))).sort();
  const useCount = new Map<string, number>();
  for (const u of usage ?? []) useCount.set(u.story_id, (useCount.get(u.story_id) ?? 0) + 1);
  const filtered = Boolean(sp.q || sp.tag || sp.status);

  return (
    <PageContainer>
      <PageHeader
        title="Story Bank"
        description="Your reusable experiences. Specific, true stories are the raw material of strong essays — the AI recommends the relevant ones for each prompt, never all of them."
        actions={
          <>
            <ImportFromLetterStudio />
            <Button asChild>
              <Link href="/stories/new">
                <Plus /> New story
              </Link>
            </Button>
          </>
        }
      />
      <StoryFilters tags={tags} />
      {!stories?.length ? (
        <EmptyState
          icon={BookMarked}
          title={filtered ? "No matching stories" : archived ? "No archived stories" : "Your Story Bank is empty"}
          description={filtered ? "Try a different search or filter." : "Record an experience: the context, what you did, what happened, and what you learned."}
          action={
            !filtered && !archived ? (
              <Button asChild>
                <Link href="/stories/new">Add your first story</Link>
              </Button>
            ) : undefined
          }
        />
      ) : (
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {stories.map((s) => (
            <li key={s.id}>
              <Link href={`/stories/${s.id}`} className="flex h-full flex-col gap-2 rounded-xl border bg-card p-4 outline-none hover:border-foreground/20 focus-visible:ring-2 focus-visible:ring-ring">
                <div className="flex items-start justify-between gap-2">
                  <h2 className="font-heading text-[1.02rem] leading-snug font-semibold">{s.title}</h2>
                  <VerificationBadge value={s.verification_status} />
                </div>
                {(s.outcome || s.context) && <p className="line-clamp-2 text-sm text-muted-foreground">{s.outcome || s.context}</p>}
                <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-1 text-xs text-muted-foreground">
                  {s.period && <span>{s.period}</span>}
                  {s.tags.slice(0, 4).map((t) => (
                    <Pill key={t}>{t}</Pill>
                  ))}
                  <span className="ml-auto">{useCount.get(s.id) ? `Used in ${useCount.get(s.id)} essay${useCount.get(s.id) === 1 ? "" : "s"}` : "Not used yet"}</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </PageContainer>
  );
}
