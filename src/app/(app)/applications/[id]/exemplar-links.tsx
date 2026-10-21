"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LibraryBig, Link2, Unlink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState } from "@/components/empty-state";
import { setExemplarLink } from "@/server/exemplars";
import { handleResult } from "@/lib/client/result";
import type { Exemplar } from "@/lib/domain/types";

type Item = Pick<Exemplar, "id" | "title">;

export function ExemplarLinks({ applicationId, linked, available }: { applicationId: string; linked: Item[]; available: Item[] }) {
  const router = useRouter();
  const [pick, setPick] = useState<string>("");

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Attach exemplars to use their analysed techniques for this application. The original essays stay read-only and are never copied into your drafts.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Select value={pick} onValueChange={setPick} disabled={available.length === 0}>
          <SelectTrigger className="w-72" aria-label="Choose an exemplar to attach">
            <SelectValue placeholder={available.length ? "Choose an exemplar…" : "No other exemplars in your library"} />
          </SelectTrigger>
          <SelectContent>
            {available.map((x) => (
              <SelectItem key={x.id} value={x.id}>
                {x.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          disabled={!pick}
          onClick={async () => {
            if (handleResult(await setExemplarLink(pick, applicationId, true), "Exemplar attached") !== null) {
              setPick("");
              router.refresh();
            }
          }}
        >
          <Link2 /> Attach
        </Button>
        <Button asChild variant="ghost">
          <Link href="/exemplars">
            <LibraryBig /> Open library
          </Link>
        </Button>
      </div>
      {linked.length === 0 ? (
        <EmptyState icon={LibraryBig} title="No exemplars attached" description="Upload successful essays to the Exemplar Library, analyse them, then attach the relevant ones here." />
      ) : (
        <div className="flex flex-wrap gap-2">
          {linked.map((x) => (
            <Button
              key={x.id}
              variant="ghost"
              size="sm"
              onClick={async () => {
                if (handleResult(await setExemplarLink(x.id, applicationId, false), "Exemplar detached") !== null) router.refresh();
              }}
            >
              <Unlink /> Detach “{x.title}”
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
