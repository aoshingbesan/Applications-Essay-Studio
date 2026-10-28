import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { jsonError } from "@/lib/api";
import { DEFAULT_EXPORT_OPTIONS, exportPdf } from "@/lib/essay/export";
import { EXPORT_SCOPES, storyBankPieces } from "@/lib/library/export";
import type { LibraryEntry, Profile } from "@/lib/domain/types";

const querySchema = z.object({ scope: z.enum(Object.keys(EXPORT_SCOPES) as [keyof typeof EXPORT_SCOPES]).default("all") });

const SCOPE_NOTES = {
  all: "All entries, including Private ones",
  shareable: "Available and Ask-first entries (Private entries left out)",
  available: "Available entries only",
} as const;

/** Downloads the signed-in user's Story Bank as a PDF. RLS limits the query to their own entries. */
export async function GET(request: Request) {
  const { supabase, user } = await getSessionUser();
  if (!user) return jsonError(401, "Your session has expired. Please sign in again.", { code: "unauthenticated" });
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return jsonError(422, "The export request was invalid.");
  const { scope } = parsed.data;

  const [{ data: entries, error }, { data: profile }] = await Promise.all([
    supabase.from("library_entries").select("*").is("archived_at", null).returns<LibraryEntry[]>(),
    supabase.from("profiles").select("full_name, display_name").maybeSingle<Pick<Profile, "full_name" | "display_name">>(),
  ]);
  if (error) return jsonError(500, "Could not load your Story Bank.");
  const pieces = storyBankPieces(entries ?? [], scope);
  if (pieces.length === 0) return jsonError(404, "There are no entries to export with this privacy setting.");

  const date = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  try {
    const pdf = await exportPdf(pieces, {
      ...DEFAULT_EXPORT_OPTIONS,
      documentTitle: "Story Bank",
      lineSpacing: 1.3,
      fontSize: 11,
      includeTitles: true,
      cover: { title: "Story Bank", subtitle: `${SCOPE_NOTES[scope]} · ${date}`, author: profile?.full_name || profile?.display_name || undefined },
    });
    return new Response(pdf as BodyInit, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="story-bank-${new Date().toISOString().slice(0, 10)}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("[story-bank-export]", err instanceof Error ? err.message : "unknown error");
    return jsonError(500, "The PDF could not be generated. Please try again.");
  }
}
