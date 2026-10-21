import "server-only";
import { STORAGE_BUCKET } from "@/lib/domain/constants";
import { extractText } from "@/lib/documents/extract";
import type { ServerSupabase } from "@/lib/supabase/server";

/** Downloads an uploaded file (as its owner, under storage RLS) and extracts its text. */
export async function downloadAndExtract(supabase: ServerSupabase, path: string, name: string) {
  const { data, error } = await supabase.storage.from(STORAGE_BUCKET).download(path);
  if (error || !data) return null;
  const bytes = new Uint8Array(await data.arrayBuffer());
  return { size: bytes.byteLength, extraction: await extractText(name, bytes) };
}
