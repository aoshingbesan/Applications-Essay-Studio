import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { isSupabaseConfigured } from "@/lib/env";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Setup required" };

export default function SetupPage() {
  if (isSupabaseConfigured()) redirect("/");
  const code = "rounded bg-muted px-1 font-mono text-[0.8rem]";
  return (
    <div className="mx-auto max-w-2xl px-4 py-16">
      <h1 className="font-heading text-2xl font-semibold tracking-tight">Connect Supabase to get started</h1>
      <p className="mt-3 text-sm text-muted-foreground">
        Essay Studio stores your applications, drafts and documents in your own Supabase project, protected by Row Level Security. The app cannot
        run until it is connected.
      </p>
      <ol className="mt-6 list-decimal space-y-3 pl-5 text-sm">
        <li>Create a project at supabase.com.</li>
        <li>
          Apply the migrations in <code className={code}>supabase/migrations</code> in filename order (see README → Database setup).
        </li>
        <li>
          Copy <code className={code}>.env.example</code> to <code className={code}>.env.local</code> and set{" "}
          <code className={code}>NEXT_PUBLIC_SUPABASE_URL</code> and <code className={code}>NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</code>.
        </li>
        <li>
          Optionally set <code className={code}>ANTHROPIC_API_KEY</code> to enable AI analysis, outlining, drafting and review.
        </li>
        <li>Restart the development server.</li>
      </ol>
    </div>
  );
}
