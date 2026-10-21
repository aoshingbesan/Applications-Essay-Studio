import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageContainer, PageHeader, SectionHeading } from "@/components/page-header";
import { requireUser } from "@/lib/auth";
import { uuidParam } from "@/lib/api";
import type { Story } from "@/lib/domain/types";
import { StoryForm } from "../story-form";
import { StoryActions } from "./story-actions";

export const metadata: Metadata = { title: "Story" };

export default async function StoryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!uuidParam.safeParse(id).success) notFound();
  const { supabase } = await requireUser();
  const [{ data: story }, { data: uses }] = await Promise.all([
    supabase.from("story_bank_items").select("*").eq("id", id).maybeSingle<Story>(),
    supabase
      .from("essay_evidence_links")
      .select("essay_id, essays(id, title, applications(programme, name))")
      .eq("story_id", id)
      .returns<{ essay_id: string; essays: { id: string; title: string; applications: { programme: string; name: string } | null } | null }[]>(),
  ]);
  if (!story) notFound();
  return (
    <PageContainer className="max-w-3xl">
      <PageHeader title={story.title} back={{ href: "/stories", label: "Story Bank" }} eyebrow={story.archived_at ? "Archived story" : undefined} actions={<StoryActions story={story} />} />
      <section className="mb-10 rounded-xl border bg-card p-4">
        <SectionHeading title="Used in essays" />
        {uses?.length ? (
          <ul className="space-y-1 text-sm">
            {uses.map((u) =>
              u.essays ? (
                <li key={u.essay_id}>
                  <Link href={`/studio/${u.essays.id}`} className="hover:underline">
                    {u.essays.title}
                  </Link>
                  <span className="text-muted-foreground"> · {u.essays.applications?.programme || u.essays.applications?.name}</span>
                </li>
              ) : null,
            )}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">Not linked to any essay yet. Link stories from the Evidence tab in the Essay Studio.</p>
        )}
      </section>
      <StoryForm story={story} />
    </PageContainer>
  );
}
