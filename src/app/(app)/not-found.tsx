import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-4 py-24 text-center">
      <h1 className="font-heading text-xl font-semibold">Not found</h1>
      <p className="mt-2 text-sm text-muted-foreground">This item does not exist or you do not have access to it.</p>
      <Button asChild className="mt-6">
        <Link href="/">Go to dashboard</Link>
      </Button>
    </div>
  );
}
