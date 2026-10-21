import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { jsonError } from "@/lib/api";
import { sanitizeDoc } from "@/lib/essay/doc";
import { exportDocx, exportPdf, exportText, safeFileName, type ExportOptions, type ExportPiece } from "@/lib/essay/export";
import type { Essay } from "@/lib/domain/types";

const querySchema = z.object({
  essayIds: z
    .string()
    .transform((s) => s.split(",").filter(Boolean))
    .pipe(z.array(z.string().uuid()).min(1).max(20)),
  format: z.enum(["docx", "pdf", "txt"]),
  font: z.enum(["serif", "sans", "mono"]).default("serif"),
  fontSize: z.coerce.number().min(9).max(16).default(12),
  margins: z.enum(["narrow", "normal", "wide"]).default("normal"),
  lineSpacing: z.coerce.number().min(1).max(2.5).default(1.5),
  pageNumbers: z.enum(["0", "1"]).default("1"),
  titles: z.enum(["0", "1"]).default("0"),
  cover: z.enum(["0", "1"]).default("0"),
  coverTitle: z.string().max(300).optional(),
  coverSubtitle: z.string().max(300).optional(),
  coverAuthor: z.string().max(200).optional(),
});

const CONTENT_TYPES = {
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pdf: "application/pdf",
  txt: "text/plain; charset=utf-8",
} as const;

/** Exports the saved text of one or more essays. Nothing but the essays (and an optional cover) is included. */
export async function GET(request: Request) {
  const { supabase, user } = await getSessionUser();
  if (!user) return jsonError(401, "Your session has expired. Please sign in again.", { code: "unauthenticated" });
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return jsonError(422, "The export request was invalid.");
  const q = parsed.data;

  const { data: essays } = await supabase.from("essays").select("id, title, content, application_id").in("id", q.essayIds).returns<Pick<Essay, "id" | "title" | "content" | "application_id">[]>();
  if (!essays || essays.length !== new Set(q.essayIds).size) return jsonError(404, "Essay not found.");
  // Keep the order the user chose.
  const pieces: ExportPiece[] = q.essayIds.map((eid) => {
    const e = essays.find((x) => x.id === eid)!;
    return { title: e.title, doc: sanitizeDoc(e.content) ?? { type: "doc", content: [] } };
  });

  const title = pieces.length === 1 ? pieces[0].title : q.coverTitle?.trim() || "Application essays";
  const options: ExportOptions = {
    documentTitle: title,
    font: q.font,
    fontSize: q.fontSize,
    margins: q.margins,
    lineSpacing: q.lineSpacing,
    pageNumbers: q.pageNumbers === "1",
    includeTitles: q.titles === "1",
    cover: q.cover === "1" ? { title: q.coverTitle?.trim() || title, subtitle: q.coverSubtitle?.trim() || undefined, author: q.coverAuthor?.trim() || undefined } : null,
  };

  try {
    const body =
      q.format === "docx"
        ? new Uint8Array(await exportDocx(pieces, options))
        : q.format === "pdf"
          ? await exportPdf(pieces, options)
          : new TextEncoder().encode(exportText(pieces, options));
    return new Response(body as BodyInit, {
      headers: {
        "Content-Type": CONTENT_TYPES[q.format],
        "Content-Disposition": `attachment; filename="${safeFileName(title)}.${q.format}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("[export]", error instanceof Error ? error.message : "unknown error");
    return jsonError(500, "The export could not be generated. Please try again.");
  }
}
