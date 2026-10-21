import type { Metadata } from "next";
import { PageContainer, PageHeader } from "@/components/page-header";
import { DocumentsPanel } from "@/components/documents/documents-panel";
import { requireUser } from "@/lib/auth";
import type { Application, SupportingDocument } from "@/lib/domain/types";

export const metadata: Metadata = { title: "Supporting Documents" };

export default async function DocumentsPage() {
  const { supabase } = await requireUser();
  const [{ data: documents }, { data: apps }] = await Promise.all([
    supabase.from("supporting_documents").select("*").order("created_at", { ascending: false }).returns<SupportingDocument[]>(),
    supabase.from("applications").select("id, programme, name").returns<Pick<Application, "id" | "programme" | "name">[]>(),
  ]);
  const names = Object.fromEntries((apps ?? []).map((a) => [a.id, a.programme || a.name]));
  return (
    <PageContainer>
      <PageHeader
        title="Supporting Documents"
        description="Private files and their extracted text. Scanned PDFs without a text layer cannot be read — paste their text instead. Only excerpts of documents you link to an essay are ever sent to the AI."
      />
      <DocumentsPanel documents={documents ?? []} applicationId={null} applicationNames={names} />
    </PageContainer>
  );
}
