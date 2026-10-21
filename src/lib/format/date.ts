export function formatDate(value: string | null | undefined, opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" }) {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("en-GB", opts);
}

export function formatDateTime(value: string | null | undefined) {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function daysUntil(value: string, now = new Date()): number {
  const d = new Date(value);
  const start = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const end = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.round((end - start) / 86_400_000);
}

export function relativeDays(value: string): string {
  const n = daysUntil(value);
  if (n === 0) return "Today";
  if (n === 1) return "Tomorrow";
  if (n === -1) return "Yesterday";
  return n > 0 ? `In ${n} days` : `${-n} days ago`;
}

/** True when the date is today or later (deadlines due today still count as upcoming). */
export function isUpcoming(value: string | null, now = new Date()): boolean {
  return value !== null && daysUntil(value, now) >= 0;
}
