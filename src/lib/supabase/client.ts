"use client";

import { createBrowserClient } from "@supabase/ssr";
import { ESSAY_SCHEMA, getSupabasePublicConfig } from "@/lib/env";

export function createClient() {
  const config = getSupabasePublicConfig();
  if (!config) throw new Error("Supabase is not configured. See .env.example.");
  return createBrowserClient(config.url, config.key, { db: { schema: ESSAY_SCHEMA } });
}
