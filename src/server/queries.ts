import "server-only";
import type { ServerSupabase } from "@/lib/supabase/server";
import { applicationProgress, type ApplicationProgress } from "@/lib/domain/progress";
import type { Application, Essay } from "@/lib/domain/types";

export type EssaySummary = Pick<Essay, "id" | "application_id" | "title" | "essay_type" | "status" | "word_count" | "min_words" | "max_words" | "outline_status" | "archived_at" | "updated_at" | "position">;

export const ESSAY_SUMMARY_COLUMNS = "id, application_id, title, essay_type, status, word_count, min_words, max_words, outline_status, archived_at, updated_at, position";

export interface ApplicationWithProgress {
  application: Application;
  essays: EssaySummary[];
  progress: ApplicationProgress;
}

/** Applications with their essays and derived progress. */
export async function listApplications(supabase: ServerSupabase, { archived = false } = {}): Promise<ApplicationWithProgress[]> {
  let query = supabase.from("applications").select("*").order("deadline", { ascending: true, nullsFirst: false }).order("created_at", { ascending: false });
  query = archived ? query.not("archived_at", "is", null) : query.is("archived_at", null);
  const { data: apps } = await query.returns<Application[]>();
  if (!apps?.length) return [];
  const { data: essays } = await supabase
    .from("essays")
    .select(ESSAY_SUMMARY_COLUMNS)
    .in("application_id", apps.map((a) => a.id))
    .order("position")
    .returns<EssaySummary[]>();
  return apps.map((application) => {
    const own = (essays ?? []).filter((e) => e.application_id === application.id);
    return { application, essays: own, progress: applicationProgress(own, application.submitted_at) };
  });
}
