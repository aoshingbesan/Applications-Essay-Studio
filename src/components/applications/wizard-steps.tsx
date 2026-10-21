import Link from "next/link";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export const WIZARD_STEPS = ["Opportunity details", "Essay requirements", "Supporting materials", "Writing preferences"] as const;

/** Step indicator. Steps link back once the application exists. */
export function WizardSteps({ current, applicationId, reached = current }: { current: number; applicationId?: string; reached?: number }) {
  return (
    <nav aria-label="Setup progress" className="mb-8">
      <ol className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {WIZARD_STEPS.map((label, i) => {
          const n = i + 1;
          const done = n < current || (n <= reached && n !== current);
          const active = n === current;
          const inner = (
            <span className="flex items-center gap-2">
              <span
                className={cn(
                  "grid size-6 shrink-0 place-items-center rounded-full border text-xs font-medium",
                  active ? "border-ink bg-ink text-ink-foreground" : done ? "border-foreground/30 bg-muted" : "text-muted-foreground",
                )}
                aria-hidden
              >
                {done && !active ? <Check className="size-3.5" /> : n}
              </span>
              <span className={cn("text-xs leading-tight sm:text-sm", active ? "font-medium" : "text-muted-foreground")}>{label}</span>
            </span>
          );
          return (
            <li key={label} aria-current={active ? "step" : undefined} className={cn("rounded-lg border-b-2 pb-2", active ? "border-ink" : "border-transparent")}>
              {applicationId && n <= reached && !active ? (
                <Link href={`/applications/${applicationId}/setup?step=${n}`} className="rounded outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring">
                  {inner}
                </Link>
              ) : (
                inner
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
