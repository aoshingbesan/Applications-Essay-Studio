import "server-only";
import type { ServerSupabase } from "@/lib/supabase/server";
import type { EssayContextData } from "@/lib/ai/context";
import type {
  Application,
  Essay,
  EvidenceLink,
  Exemplar,
  LibraryEntry,
  Profile,
  SelectedLesson,
  SupportingDocument,
  WritingPreferences,
} from "@/lib/domain/types";

export interface EssayBundle extends EssayContextData {
  links: EvidenceLink[];
  /** Exemplars attached to the application: used for overlap checks, never sent wholesale to the AI. */
  attachedExemplars: Pick<Exemplar, "id" | "title" | "source_text">[];
  aiEnabled: boolean;
}

/** Merges the profile's default writing preferences with the application's own. */
export function mergePreferences(profile: WritingPreferences | undefined, app: WritingPreferences | undefined): WritingPreferences {
  const out: WritingPreferences = { ...(profile ?? {}) };
  for (const [k, v] of Object.entries(app ?? {})) {
    if (v !== undefined && v !== "" && !(Array.isArray(v) && v.length === 0)) (out as Record<string, unknown>)[k] = v;
  }
  return out;
}

/** Loads everything an essay workspace or AI operation needs. Every query runs under RLS. */
export async function loadEssayBundle(supabase: ServerSupabase, essayId: string): Promise<EssayBundle | null> {
  const { data: essay } = await supabase.from("essays").select("*").eq("id", essayId).maybeSingle<Essay>();
  if (!essay) return null;
  const [app, profile, entries, documents, links, lessons, exemplarLinks] = await Promise.all([
    supabase.from("applications").select("*").eq("id", essay.application_id).maybeSingle<Application>(),
    supabase.from("profiles").select("*").maybeSingle<Profile>(),
    supabase.from("library_entries").select("*").is("archived_at", null).order("section").order("position").order("updated_at", { ascending: false }).returns<LibraryEntry[]>(),
    supabase.from("supporting_documents").select("*").order("created_at", { ascending: false }).returns<SupportingDocument[]>(),
    supabase.from("essay_evidence_links").select("*").eq("essay_id", essayId).order("position").returns<EvidenceLink[]>(),
    supabase.from("exemplar_selected_lessons").select("*").eq("essay_id", essayId).order("created_at").returns<SelectedLesson[]>(),
    supabase.from("exemplar_application_links").select("exemplar_id").eq("application_id", essay.application_id),
  ]);
  if (!app.data) return null;

  const exemplarIds = new Set<string>([...(exemplarLinks.data ?? []).map((l) => l.exemplar_id), ...(lessons.data ?? []).map((l) => l.exemplar_id)]);
  const { data: exemplars } = exemplarIds.size
    ? await supabase.from("exemplars").select("id, title, source_text").in("id", [...exemplarIds]).returns<Pick<Exemplar, "id" | "title" | "source_text">[]>()
    : { data: [] as Pick<Exemplar, "id" | "title" | "source_text">[] };

  const l = links.data ?? [];
  return {
    essay: { ...essay, gap_questions: Array.isArray(essay.gap_questions) ? essay.gap_questions : [] },
    application: app.data,
    preferences: mergePreferences(profile.data?.writing_preferences, app.data.writing_preferences),
    entries: entries.data ?? [],
    documents: documents.data ?? [],
    linked: {
      entryIds: l.flatMap((x) => (x.entry_id ? [x.entry_id] : [])),
      documentIds: l.flatMap((x) => (x.document_id ? [x.document_id] : [])),
    },
    lessons: lessons.data ?? [],
    exemplarTitles: Object.fromEntries((exemplars ?? []).map((e) => [e.id, e.title])),
    links: l,
    attachedExemplars: (exemplars ?? []).filter((e) => (exemplarLinks.data ?? []).some((x) => x.exemplar_id === e.id) || lessons.data?.some((x) => x.exemplar_id === e.id)),
    aiEnabled: profile.data?.ai_enabled ?? true,
  };
}

/**
 * Text of the applicant's recorded evidence, used by the deterministic checks to see whether
 * figures in the essay are supported. It never leaves the server, so every entry counts —
 * including Private ones — to avoid flagging true figures as unsupported.
 */
export function evidenceCorpus(bundle: EssayBundle): string {
  const entries = bundle.entries.map((e) => [e.title, e.summary, e.period, e.figures, e.context, e.challenge, e.actions, e.outcome, e.measurable_impact, e.lessons, e.narrative].filter(Boolean).join(" "));
  const docs = bundle.documents.filter((d) => bundle.linked.documentIds.includes(d.id)).map((d) => d.extracted_text ?? "");
  return [...entries, ...docs, bundle.application.course_description ?? "", ...bundle.essay.gap_questions.map((q) => q.answer)].join("\n");
}
