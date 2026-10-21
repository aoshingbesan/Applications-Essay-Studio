import type { Metadata } from "next";
import Link from "next/link";
import { Archive, FolderPlus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageContainer, PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { ApplicationCard } from "@/components/application-card";
import { requireUser } from "@/lib/auth";
import { listApplications } from "@/server/queries";

export const metadata: Metadata = { title: "Applications" };

export default async function ApplicationsPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const { supabase } = await requireUser();
  const archived = (await searchParams).view === "archived";
  const apps = await listApplications(supabase, { archived });

  return (
    <PageContainer>
      <PageHeader
        title="Applications"
        description="Each application holds its own prompts, requirements, documents, exemplars and essays."
        actions={
          <>
            <Button asChild variant="ghost">
              <Link href={archived ? "/applications" : "/applications?view=archived"}>
                <Archive /> {archived ? "Show active" : "Archived"}
              </Link>
            </Button>
            <Button asChild>
              <Link href="/applications/new">
                <Plus /> Create application
              </Link>
            </Button>
          </>
        }
      />
      {apps.length === 0 ? (
        <EmptyState
          icon={archived ? Archive : FolderPlus}
          title={archived ? "No archived applications" : "No applications yet"}
          description={archived ? "Archived applications are kept here with all their essays and versions." : "Create an application for each programme, scholarship or fellowship you are applying to."}
          action={
            archived ? undefined : (
              <Button asChild>
                <Link href="/applications/new">Create application</Link>
              </Button>
            )
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {apps.map((a) => (
            <ApplicationCard key={a.application.id} item={a} />
          ))}
        </div>
      )}
    </PageContainer>
  );
}
