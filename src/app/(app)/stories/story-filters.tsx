"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { STORY_VERIFICATION, STORY_VERIFICATION_LABELS } from "@/lib/domain/constants";

export function StoryFilters({ tags }: { tags: string[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");

  const set = (key: string, value: string | null) => {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    router.replace(`${pathname}?${next.toString()}`);
  };

  return (
    <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
      <form
        role="search"
        className="relative flex-1 sm:max-w-sm"
        onSubmit={(e) => {
          e.preventDefault();
          set("q", q.trim() || null);
        }}
      >
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input aria-label="Search stories" placeholder="Search stories…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-8" />
      </form>
      <Select value={params.get("tag") ?? "all"} onValueChange={(v) => set("tag", v === "all" ? null : v)}>
        <SelectTrigger className="w-full sm:w-44" aria-label="Filter by tag">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All tags</SelectItem>
          {tags.map((t) => (
            <SelectItem key={t} value={t}>
              {t}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={params.get("status") ?? "all"} onValueChange={(v) => set("status", v === "all" ? null : v)}>
        <SelectTrigger className="w-full sm:w-48" aria-label="Filter by verification">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Any verification</SelectItem>
          {STORY_VERIFICATION.map((s) => (
            <SelectItem key={s} value={s}>
              {STORY_VERIFICATION_LABELS[s]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button variant="ghost" onClick={() => set("archived", params.get("archived") === "1" ? null : "1")}>
        {params.get("archived") === "1" ? "Show active" : "Show archived"}
      </Button>
    </div>
  );
}
