import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export type Importance = "critical" | "recommended" | "optional";

export function ImportanceMark({ importance }: { importance?: Importance }) {
  if (importance === "critical") {
    return (
      <span className="ml-1 text-destructive" title="Essential">
        *<span className="sr-only"> (essential)</span>
      </span>
    );
  }
  if (importance === "recommended") {
    return <span className="ml-1.5 text-[0.7rem] font-normal text-muted-foreground">Recommended</span>;
  }
  return null;
}

export function Field({
  id,
  label,
  hint,
  error,
  importance,
  children,
  className,
}: {
  id: string;
  label: React.ReactNode;
  hint?: React.ReactNode;
  error?: string;
  importance?: Importance;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={id} className="leading-snug">
        <span>
          {label}
          <ImportanceMark importance={importance} />
        </span>
      </Label>
      {children}
      {hint && !error && (
        <p id={`${id}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
