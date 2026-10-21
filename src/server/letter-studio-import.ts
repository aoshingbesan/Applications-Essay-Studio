"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { withUser } from "@/lib/auth";
import { LETTER_STUDIO_SCHEMA } from "@/lib/env";
import { nullify, storySchema } from "@/lib/domain/schemas";
import type { ActionResult } from "@/lib/domain/types";
import {
  LETTER_STUDIO_EVIDENCE_COLUMNS,
  evidenceToStory,
  letterStudioSourceRef,
  mapVerification,
  type LetterStudioEvidence,
} from "@/lib/import/letter-studio";

export interface ImportableEvidence {
  id: string;
  title: string;
  category: string;
  period: string | null;
  verification: ReturnType<typeof mapVerification>;
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
    const { data: existing } = await supabase.from("story_bank_items").select("source_ref").not("source_ref", "is", null).returns<{ source_ref: string }[]>();
    const imported = new Set((existing ?? []).map((r) => r.source_ref));
    return {
      ok: true,
      data: {
        items: (data ?? []).map((e) => ({
          id: e.id,
          title: e.title,
          category: e.category,
          period: e.period,
          verification: mapVerification(e.verification_status),
          alreadyImported: imported.has(letterStudioSourceRef(e.id)),
        })),
      },
    };
  });
}

const ids = z.array(z.string().uuid()).min(1).max(200);

/** Copies the chosen Letter Studio evidence into the Story Bank. Items already imported are skipped. */
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
    let imported = 0;
    let skipped = parsed.data.length - (data?.length ?? 0);
    for (const e of data ?? []) {
      const story = storySchema.parse(evidenceToStory(e));
      const { error: insertError } = await supabase.from("story_bank_items").insert({
        ...nullify(story),
        title: story.title,
        skills: story.skills,
        related_criteria: story.related_criteria,
        tags: story.tags,
        verification_status: story.verification_status,
        source_ref: letterStudioSourceRef(e.id),
      });
      if (insertError?.code === "23505") skipped++;
      else if (insertError) return { ok: false, error: `Imported ${imported} item(s), then an error stopped the import. Please try again.` };
      else imported++;
    }
    revalidatePath("/stories");
    return { ok: true, data: { imported, skipped } };
  });
}
