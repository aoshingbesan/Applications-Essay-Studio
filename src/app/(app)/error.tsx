"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const router = useRouter();
  useEffect(() => {
    console.error("[page]", error.digest ?? error.message);
  }, [error]);
  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-4 py-24 text-center">
      <AlertTriangle className="mb-3 size-6 text-warning" aria-hidden />
      <h1 className="font-heading text-xl font-semibold">Something went wrong</h1>
      <p className="mt-2 text-sm text-muted-foreground">The page could not be loaded. Your saved work is not affected.</p>
      <div className="mt-6 flex gap-2">
        <Button onClick={reset}>Try again</Button>
        <Button variant="outline" onClick={() => router.push("/")}>
          Go to dashboard
        </Button>
      </div>
    </div>
  );
}
