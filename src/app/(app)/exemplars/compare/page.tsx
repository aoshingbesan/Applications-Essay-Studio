import type { Metadata } from "next";
import Link from "next/link";
import { PageContainer, PageHeader } from "@/components/page-header";
import { ProvenanceBadge } from "@/components/badges";
import { requireUser } from "@/lib/auth";
import { uuidParam } from "@/lib/api";
import { EXEMPLAR_SPEC_VERSION } from "@/lib/ai/prompts/exemplars";
import type { ExemplarReport } from "@/lib/ai/schemas";
import type { Exemplar } from "@/lib/domain/types";
import { CompareRunner } from "./compare-runner";

export const metadata: Metadata = { title: "Compare exemplars" };

export default async function ComparePage({ searchParams }: { searchParams: Promise<{ ids?: string }> }) {
  const ids = ((await searchParams).ids ?? "").split(",").filter((i) => uuidParam.safeParse(i).success).slice(0, 5);
  const { supabase } = await requireUser();
  const [{ data: exemplars }, { data: analyses }] = await Promise.all([
    supabase.from("exemplars").select("id, title, provenance, source_hash, essay_category").in("id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]).returns<Exemplar[]>(),
    supabase
      .from("exemplar_analyses")
      .select("exemplar_id, report, source_hash")
      .in("exemplar_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"])
      .eq("status", "complete")
      .eq("spec_version", EXEMPLAR_SPEC_VERSION)
      .order("created_at", { ascending: false })
      .returns<{ exemplar_id: string; report: ExemplarReport; source_hash: string }[]>(),
  ]);
  const rows = (exemplars ?? []).map((x) => ({ x, report: (analyses ?? []).find((a) => a.exemplar_id === x.id && a.source_hash === x.source_hash)?.report ?? null }));

  return (
    <PageContainer wide>
      <PageHeader
        title="Compare exemplars"
        description="Shared techniques and alternative approaches across samples. A handful of essays cannot show which technique causes success."
        back={{ href: "/exemplars", label: "Exemplar Library" }}
      />
      {rows.length < 2 ? (
        <p className="text-sm text-muted-foreground">Select two to five analysed exemplars in the library to compare them.</p>
      ) : (
        <div className="space-y-8">
          <div className="overflow-x-auto rounded-xl border bg-card">
            <table className="w-full min-w-[40rem] text-left text-sm">
              <thead className="border-b text-xs text-muted-foreground">
                <tr>
                  <th className="p-3 font-medium">Exemplar</th>
                  <th className="p-3 font-medium">Opening</th>
                  <th className="p-3 font-medium">Structure</th>
                  <th className="p-3 font-medium">Tone</th>
                  <th className="p-3 font-medium">Conclusion</th>
                </tr>
              </thead>
              <tbody className="divide-y align-top">
                {rows.map(({ x, report }) => (
                  <tr key={x.id}>
                    <td className="p-3">
                      <Link href={`/exemplars/${x.id}`} className="font-medium hover:underline">
                        {x.title}
                      </Link>
                      <div className="mt-1">
                        <ProvenanceBadge value={x.provenance} />
                      </div>
                    </td>
                    {report ? (
                      <>
                        <td className="p-3">
                          <span className="capitalize">{report.opening.opening_type.replace(/_/g, " ")}</span> — {report.opening.how_it_begins}
                        </td>
                        <td className="p-3">{report.structure.sections.map((s) => s.label).join(" → ")}</td>
                        <td className="p-3">{report.techniques.tone_voice}</td>
                        <td className="p-3">{report.structure.conclusion_strategy}</td>
                      </>
                    ) : (
                      <td className="p-3 text-muted-foreground" colSpan={4}>
                        Not analysed (or out of date).
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <CompareRunner ids={rows.map((r) => r.x.id)} ready={rows.every((r) => r.report)} />
        </div>
      )}
    </PageContainer>
  );
}
