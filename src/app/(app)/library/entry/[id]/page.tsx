import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageContainer, PageHeader, SectionHeading } from "@/components/page-header";
import { requireUser } from "@/lib/auth";
import { uuidParam } from "@/lib/api";
import { SECTION_BY_KEY, type Privacy } from "@/lib/library/sections";
import type { LibraryEntry, SupportingDocument } from "@/lib/domain/types";
import { EntryForm } from "../entry-form";
import { entryDefaults } from "@/lib/library/entry-defaults";
import { EntryActions } from "./entry-actions";

export const metadata: Metadata = { title: "Story Bank entry" };

export default async function EntryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!uuidParam.safeParse(id).success) notFound();
  const { supabase } = await requireUser();
  const [{ data: entry }, { data: settings }, { data: documents }, { data: docLinks }, { data: uses }] = await Promise.all([
    supabase.from("library_entries").select("*").eq("id", id).maybeSingle<LibraryEntry>(),
    supabase.from("library_section_settings").select("section, default_privacy").returns<{ section: string; default_privacy: Privacy }[]>(),
    supabase.from("supporting_documents").select("id, title").order("created_at", { ascending: false }).returns<Pick<SupportingDocument, "id" | "title">[]>(),
    supabase.from("entry_documents").select("document_id").eq("entry_id", id).returns<{ document_id: string }[]>(),
    supabase
      .from("essay_evidence_links")
      .select("essay_id, essays(id, title, applications(programme, name))")
      .eq("entry_id", id)
      .returns<{ essay_id: string; essays: { id: string; title: string; applications: { programme: string; name: string } | null } | null }[]>(),
  ]);
  if (!entry) notFound();
  const def = SECTION_BY_KEY[entry.section];
  return (
    <PageContainer className="max-w-3xl">
      <PageHeader
        title={entry.title}
        eyebrow={`${def.number} · ${def.title}${entry.archived_at ? " · Archived" : ""}`}
        back={{ href: `/library/${entry.section}`, label: def.title }}
        actions={<EntryActions entry={entry} />}
      />
      <section className="mb-6 rounded-xl border bg-card p-4">
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
          <p className="text-sm text-muted-foreground">Not linked to any essay yet. Link entries from the Evidence tab in the Essay Studio.</p>
        )}
      </section>
      <EntryForm
        entryId={entry.id}
        initial={entryDefaults(entry, entry.section, entry.privacy)}
        documents={documents ?? []}
        linkedDocumentIds={(docLinks ?? []).map((d) => d.document_id)}
        sectionDefaults={Object.fromEntries((settings ?? []).map((s) => [s.section, s.default_privacy]))}
      />
    </PageContainer>
  );
}
