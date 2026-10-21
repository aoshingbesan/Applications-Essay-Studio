import { getSessionUser } from "@/lib/auth";
import { jsonError } from "@/lib/api";

const TABLES = [
  "applications",
  "application_requirements",
  "essays",
  "essay_versions",
  "essay_evidence_links",
  "essay_reviews",
  "personal_evidence",
  "story_bank_items",
  "supporting_documents",
  "exemplars",
  "exemplar_analyses",
  "exemplar_application_links",
  "exemplar_selected_lessons",
  "ai_generation_jobs",
] as const;

/** Exports all of the signed-in user's records as JSON. Uploaded files are listed by name, not embedded. */
export async function GET() {
  const { supabase, user } = await getSessionUser();
  if (!user) return jsonError(401, "Your session has expired. Please sign in again.", { code: "unauthenticated" });
  const out: Record<string, unknown> = { exported_at: new Date().toISOString(), account: { id: user.id, email: user.email } };
  const { data: profile } = await supabase.from("profiles").select("*").maybeSingle();
  out.profile = profile;
  for (const table of TABLES) {
    const { data, error } = await supabase.from(table).select("*");
    if (error) return jsonError(500, "The export could not be completed. Please try again.");
    out[table] = data;
  }
  return new Response(JSON.stringify(out, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="essay-studio-export-${new Date().toISOString().slice(0, 10)}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
