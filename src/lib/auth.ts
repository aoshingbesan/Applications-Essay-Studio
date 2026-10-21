import "server-only";
import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { createClient, type ServerSupabase } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/domain/types";

export async function getSessionUser(): Promise<{ supabase: ServerSupabase; user: User | null }> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  return { supabase, user: data.user ?? null };
}

/** For pages and layouts: redirects to the login page when the session has expired. */
export async function requireUser(): Promise<{ supabase: ServerSupabase; user: User }> {
  const { supabase, user } = await getSessionUser();
  if (!user) redirect("/login?expired=1");
  return { supabase, user };
}

export const UNAUTHENTICATED: ActionResult<never> = {
  ok: false,
  error: "Your session has expired. Please sign in again.",
  code: "unauthenticated",
};

/** For server actions: runs fn with an authenticated client, or returns an unauthenticated result. */
export async function withUser<T>(
  fn: (ctx: { supabase: ServerSupabase; user: User }) => Promise<ActionResult<T>>,
): Promise<ActionResult<T>> {
  const { supabase, user } = await getSessionUser();
  if (!user) return UNAUTHENTICATED;
  try {
    return await fn({ supabase, user });
  } catch (error) {
    // Log only the error type/message, never request payloads (which may hold personal data).
    console.error("[action]", error instanceof Error ? error.message : "unknown error");
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}
