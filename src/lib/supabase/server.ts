import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { ESSAY_SCHEMA, getSupabasePublicConfig } from "@/lib/env";

export async function createClient() {
  // Read cookies first so every caller is rendered per request.
  const cookieStore = await cookies();
  const config = getSupabasePublicConfig();
  if (!config) throw new Error("Supabase is not configured. See .env.example.");
  return createServerClient(config.url, config.key, {
    db: { schema: ESSAY_SCHEMA },
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a Server Component, where cookies are read-only. The proxy refreshes sessions.
        }
      },
    },
  });
}

export type ServerSupabase = Awaited<ReturnType<typeof createClient>>;
