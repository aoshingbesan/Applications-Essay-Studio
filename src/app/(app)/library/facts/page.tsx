import type { Metadata } from "next";
import Link from "next/link";
import { PageContainer, PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { ClassificationBadge, PrivacyBadge } from "@/components/badges";
import { requireUser } from "@/lib/auth";
import { ENTRY_SECTIONS, SECTION_BY_KEY } from "@/lib/library/sections";
import type { LibraryEntry } from "@/lib/domain/types";
import { ListChecks } from "lucide-react";

export const metadata: Metadata = { title: "Key facts" };

type Row = Pick<LibraryEntry, "id" | "section" | "title" | "role" | "organisation" | "period" | "figures" | "classification" | "privacy">;

/** The structured facts from every section, at a glance. */
export default async function KeyFactsPage() {
  const { supabase } = await requireUser();
  const { data } = await supabase
    .from("library_entries")
    .select("id, section, title, role, organisation, period, figures, classification, privacy")
    .is("archived_at", null)
    .order("position")
    .returns<Row[]>();
  const rows = data ?? [];
  return (
    <PageContainer wide>
      <PageHeader
        title="Key facts"
        description="The structured facts from every Story Bank section — roles, institutions, dates and figures — in one place. Open an entry to see or edit its story."
        back={{ href: "/library", label: "Story Bank" }}
      />
      {rows.length === 0 ? (
        <EmptyState icon={ListChecks} title="No facts recorded yet" description="Add entries to any Story Bank section; their facts appear here." />
      ) : (
        <div className="space-y-8">
          {ENTRY_SECTIONS.filter((s) => rows.some((r) => r.section === s)).map((s) => (
            <section key={s} aria-labelledby={`kf-${s}`}>
              <h2 id={`kf-${s}`} className="mb-2 text-sm font-semibold">
                <span className="mr-1.5 font-mono text-xs text-muted-foreground">{SECTION_BY_KEY[s].number}</span>
                {SECTION_BY_KEY[s].title}
              </h2>
              <div className="overflow-x-auto rounded-xl border bg-card">
                <table className="w-full min-w-[44rem] text-left text-sm">
                  <thead className="border-b text-xs text-muted-foreground">
                    <tr>
                      <th className="p-3 font-medium">Entry</th>
                      <th className="p-3 font-medium">{SECTION_BY_KEY[s].labels.role}</th>
                      <th className="p-3 font-medium">{SECTION_BY_KEY[s].labels.organisation}</th>
                      <th className="p-3 font-medium">When</th>
                      <th className="p-3 font-medium">Figures</th>
                      <th className="p-3 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y align-top">
                    {rows
                      .filter((r) => r.section === s)
                      .map((r) => (
                        <tr key={r.id}>
                          <td className="p-3">
                            <Link href={`/library/entry/${r.id}`} className="font-medium hover:underline">
                              {r.title}
                            </Link>
                          </td>
                          <td className="p-3">{r.role ?? "—"}</td>
                          <td className="p-3">{r.organisation ?? "—"}</td>
                          <td className="p-3 whitespace-nowrap">{r.period ?? "—"}</td>
                          <td className="p-3">{r.figures ?? "—"}</td>
                          <td className="p-3">
                            <div className="flex flex-wrap gap-1">
                              <ClassificationBadge value={r.classification} />
                              <PrivacyBadge value={r.privacy} />
                            </div>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
        </div>
      )}
    </PageContainer>
  );
}
