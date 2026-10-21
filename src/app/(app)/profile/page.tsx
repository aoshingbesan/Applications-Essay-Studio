import type { Metadata } from "next";
import { PageContainer, PageHeader } from "@/components/page-header";
import { requireUser } from "@/lib/auth";
import type { PersonalEvidence, SupportingDocument } from "@/lib/domain/types";
import { ProfileEditor } from "./profile-editor";

export const metadata: Metadata = { title: "Personal Profile" };

export default async function ProfilePage() {
  const { supabase } = await requireUser();
  const [{ data: evidence }, { data: documents }] = await Promise.all([
    supabase.from("personal_evidence").select("*").order("section").order("position").order("created_at").returns<PersonalEvidence[]>(),
    supabase.from("supporting_documents").select("id, title").order("created_at", { ascending: false }).returns<Pick<SupportingDocument, "id" | "title">[]>(),
  ]);
  return (
    <PageContainer>
      <PageHeader
        title="Personal Profile"
        description="Reusable facts about you, used across applications. Classify each entry honestly: drafts state verified facts as facts, write goals as intentions, and never present unconfirmed items as established."
      />
      <ProfileEditor evidence={evidence ?? []} documents={documents ?? []} />
    </PageContainer>
  );
}
