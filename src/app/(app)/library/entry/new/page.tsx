import type { Metadata } from "next";
import { PageContainer, PageHeader } from "@/components/page-header";
import { requireUser } from "@/lib/auth";
import { ENTRY_SECTIONS, SECTION_BY_KEY, type EntrySection, type Privacy } from "@/lib/library/sections";
import type { SupportingDocument } from "@/lib/domain/types";
import { EntryForm } from "../entry-form";
import { entryDefaults } from "@/lib/library/entry-defaults";

export const metadata: Metadata = { title: "New entry" };

export default async function NewEntryPage({ searchParams }: { searchParams: Promise<{ section?: string; prompt?: string }> }) {
  const sp = await searchParams;
  const section: EntrySection = (ENTRY_SECTIONS as readonly string[]).includes(sp.section ?? "") ? (sp.section as EntrySection) : "background";
  const { supabase } = await requireUser();
  const [{ data: settings }, { data: documents }] = await Promise.all([
    supabase.from("library_section_settings").select("section, default_privacy").returns<{ section: string; default_privacy: Privacy }[]>(),
    supabase.from("supporting_documents").select("id, title").order("created_at", { ascending: false }).returns<Pick<SupportingDocument, "id" | "title">[]>(),
  ]);
  const defaults = Object.fromEntries((settings ?? []).map((s) => [s.section, s.default_privacy]));
  const def = SECTION_BY_KEY[section];
  return (
    <PageContainer className="max-w-3xl">
      <PageHeader title="New entry" description="Record one experience, fact or goal. Short and specific beats long and general." back={{ href: `/library/${section}`, label: def.title }} />
      <EntryForm
        entryId={null}
        initial={entryDefaults(null, section, defaults[section] ?? def.defaultPrivacy, sp.prompt?.slice(0, 500))}
        documents={documents ?? []}
        linkedDocumentIds={[]}
        sectionDefaults={defaults}
      />
    </PageContainer>
  );
}
