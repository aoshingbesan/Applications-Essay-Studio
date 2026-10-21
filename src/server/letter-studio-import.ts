"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { withUser } from "@/lib/auth";
import { LETTER_STUDIO_SCHEMA } from "@/lib/env";
import { entrySchema, nullify } from "@/lib/domain/schemas";
import { SECTION_BY_KEY, sectionTitle, type Privacy } from "@/lib/library/sections";
import type { ActionResult } from "@/lib/domain/types";
import {
  LETTER_STUDIO_EVIDENCE_COLUMNS,
  evidenceToEntry,
  letterStudioSourceRef,
  mapClassification,
  sectionForCategory,
  type LetterStudioEvidence,
} from "@/lib/import/letter-studio";
import type { EvidenceClassification } from "@/lib/domain/constants";

export interface ImportableEvidence {
  id: string;
  title: string;
  category: string;
  period: string | null;
  /** The Story Bank section it will go into. */
  section: string;
  classification: EvidenceClassification;
  alreadyImported: boolean;
}

const UNAVAILABLE = "Recommendation Letter Studio's evidence isn't available in this Supabase project.";

/** The signed-in user's Letter Studio evidence (read under that app's RLS) and what is already imported. */
export async function listLetterStudioEvidence(): Promise<ActionResult<{ items: ImportableEvidence[] }>> {
  return withUser(async ({ supabase }) => {
    const { data, error } = await supabase
      .schema(LETTER_STUDIO_SCHEMA)
      .from("evidence")
      .select(LETTER_STUDIO_EVIDENCE_COLUMNS)
      .order("created_at", { ascending: false })
      .limit(500)
      .returns<LetterStudioEvidence[]>();
    if (error) return { ok: false, error: UNAVAILABLE, code: "unavailable" };
    const { data: existing } = await supabase.from("library_entries").select("source_ref").not("source_ref", "is", null).returns<{ source_ref: string }[]>();
    const imported = new Set((existing ?? []).map((r) => r.source_ref));
    return {
      ok: true,
      data: {
        items: (data ?? []).map((e) => ({
          id: e.id,
          title: e.title,
          category: e.category,
          period: e.period,
          section: sectionTitle(sectionForCategory(e.category)),
          classification: mapClassification(e.verification_status),
          alreadyImported: imported.has(letterStudioSourceRef(e.id)),
        })),
      },
    };
  });
}

const ids = z.array(z.string().uuid()).min(1).max(200);

/**
 * Copies the chosen Letter Studio evidence into the matching Story Bank sections, each with that
 * section's default privacy. Items already imported are skipped.
 */
export async function importLetterStudioEvidence(evidenceIds: string[]): Promise<ActionResult<{ imported: number; skipped: number }>> {
  const parsed = ids.safeParse(Array.from(new Set(evidenceIds)));
  if (!parsed.success) return { ok: false, error: "Choose between 1 and 200 items to import.", code: "validation" };
  return withUser(async ({ supabase }) => {
    const { data, error } = await supabase
      .schema(LETTER_STUDIO_SCHEMA)
      .from("evidence")
      .select(LETTER_STUDIO_EVIDENCE_COLUMNS)
      .in("id", parsed.data)
      .returns<LetterStudioEvidence[]>();
    if (error) return { ok: false, error: UNAVAILABLE, code: "unavailable" };
    const { data: settings } = await supabase.from("library_section_settings").select("section, default_privacy").returns<{ section: string; default_privacy: Privacy }[]>();
    const privacyFor = (section: string): Privacy =>
      settings?.find((x) => x.section === section)?.default_privacy ?? SECTION_BY_KEY[section as keyof typeof SECTION_BY_KEY]?.defaultPrivacy ?? "available";
    let imported = 0;
    let skipped = parsed.data.length - (data?.length ?? 0);
    for (const e of data ?? []) {
      const entry = entrySchema.parse(evidenceToEntry(e, privacyFor(sectionForCategory(e.category))));
      const { error: insertError } = await supabase.from("library_entries").insert({
        ...nullify(entry),
        section: entry.section,
        also_in: entry.also_in,
        title: entry.title,
        skills: entry.skills,
        related_criteria: entry.related_criteria,
        tags: entry.tags,
        classification: entry.classification,
        privacy: entry.privacy,
        source_ref: letterStudioSourceRef(e.id),
      });
      if (insertError?.code === "23505") skipped++;
      else if (insertError) return { ok: false, error: `Imported ${imported} item(s), then an error stopped the import. Please try again.` };
      else imported++;
    }
    revalidatePath("/library", "layout");
    return { ok: true, data: { imported, skipped } };
  });
}
