"use client";

import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

const OPTIONS = [
  { scope: "all", label: "Everything", hint: "Includes Private entries — keep this copy safe" },
  { scope: "shareable", label: "Leave out Private entries", hint: "Available and Ask-first only" },
  { scope: "available", label: "Available entries only", hint: "Safest to share" },
] as const;

/** Downloads the Story Bank as a PDF; the user picks which privacy levels go in it. */
export function ExportStoryBank() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline">
          <Download /> Download PDF
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel>What to include</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {OPTIONS.map((o) => (
          <DropdownMenuItem key={o.scope} asChild>
            <a href={`/api/library/export?scope=${o.scope}`} download className="flex flex-col items-start gap-0.5">
              <span>{o.label}</span>
              <span className="text-xs text-muted-foreground">{o.hint}</span>
            </a>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
