import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { isSupabaseConfigured } from "@/lib/env";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  if (!isSupabaseConfigured()) redirect("/setup");
  const params = await searchParams;
  const notice =
    params.expired === "1"
      ? "Your session expired. Please sign in again."
      : params.deleted === "1"
        ? "Your account and all of its data have been deleted."
        : params.error === "link"
          ? "That sign-in link is invalid or has expired. Please try again."
          : null;
  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <span aria-hidden className="mb-4 grid size-9 place-items-center rounded-lg bg-primary font-heading text-lg font-semibold text-primary-foreground">
            E
          </span>
          <h1 className="font-heading text-2xl font-semibold tracking-tight">Essay Studio</h1>
          <p className="mt-2 text-sm text-balance text-muted-foreground">
            Build from evidence. Learn from exemplars. Write with purpose. Refine with intention.
          </p>
        </div>
        <LoginForm notice={notice} next={params.next} />
        <p className="mt-6 text-center text-xs text-muted-foreground">Your drafts, documents and exemplars are private to your account.</p>
      </div>
    </div>
  );
}
