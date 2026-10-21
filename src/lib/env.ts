// Environment access. Public values are inlined at build time by Next.js; server-only
// values (the Anthropic key) must never be imported into client components.

/**
 * Essay Studio's database schema. The Supabase project (and its user accounts) can be shared with
 * Recommendation Letter Studio, whose tables live in "public"; Essay Studio never writes there.
 */
export const ESSAY_SCHEMA = "essay";

/** Recommendation Letter Studio's schema, read only by the evidence import. */
export const LETTER_STUDIO_SCHEMA = "public";

export function getSupabasePublicConfig(): { url: string; key: string } | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return { url, key };
}

export function isSupabaseConfigured(): boolean {
  return getSupabasePublicConfig() !== null;
}
