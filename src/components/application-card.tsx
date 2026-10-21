import Link from "next/link";
import { CalendarClock } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { StatusBadge } from "@/components/badges";
import { APPLICATION_CATEGORY_LABELS } from "@/lib/domain/constants";
import { daysUntil, formatDate } from "@/lib/format/date";
import type { ApplicationWithProgress } from "@/server/queries";
import { cn } from "@/lib/utils";

export function DeadlineText({ deadline, className }: { deadline: string | null; className?: string }) {
  if (!deadline) return <span className={cn("text-muted-foreground", className)}>No deadline set</span>;
  const days = daysUntil(deadline);
  const urgent = days >= 0 && days <= 14;
  return (
    <span className={cn(urgent ? "font-medium text-warning" : days < 0 ? "text-muted-foreground" : "", className)}>
      {formatDate(deadline)}
      <span className="text-muted-foreground"> · {days < 0 ? "passed" : days === 0 ? "today" : `${days} day${days === 1 ? "" : "s"} left`}</span>
    </span>
  );
}

export function ApplicationCard({ item }: { item: ApplicationWithProgress }) {
  const { application: a, essays, progress } = item;
  const active = essays.filter((e) => !e.archived_at);
  const setupIncomplete = !a.setup_completed_at;
  return (
    <Link
      href={setupIncomplete ? `/applications/${a.id}/setup` : `/applications/${a.id}`}
      className="group flex min-w-0 flex-col gap-3 rounded-xl border bg-card p-4 transition-colors duration-(--duration-fast) outline-none hover:border-foreground/20 focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-xs text-muted-foreground">{a.institution}</div>
          <h3 className="mt-0.5 font-heading text-[1.05rem] leading-snug font-semibold group-hover:underline">{a.programme || a.name}</h3>
        </div>
        <StatusBadge status={progress.status} />
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span>{APPLICATION_CATEGORY_LABELS[a.category]}</span>
        <span className="inline-flex items-center gap-1">
          <CalendarClock className="size-3.5" aria-hidden />
          <DeadlineText deadline={a.deadline} />
        </span>
      </div>
      <div className="mt-auto space-y-1.5">
        <div className="flex justify-between text-xs">
          <span className="text-muted-foreground">
            {setupIncomplete ? "Setup in progress" : `${progress.essaysReady} of ${active.length} essay${active.length === 1 ? "" : "s"} ready`}
          </span>
          <span className="tabular-nums">{progress.percent}%</span>
        </div>
        <Progress value={progress.percent} aria-label={`${a.programme || a.name} progress`} />
      </div>
    </Link>
  );
}
