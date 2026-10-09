// Date & number helpers. Dates are stored as "YYYY-MM-DD" (local day),
// created_at as ISO datetime strings.

export function roundM(n: number): number {
  return Math.round(n * 1000) / 1000;
}

export function fmtM(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  const r = roundM(n);
  return String(r);
}

export function todayStr(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function isValidDateStr(s: unknown): s is string {
  return (
    typeof s === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(s) &&
    !Number.isNaN(Date.parse(s + "T00:00:00Z"))
  );
}

function toUtcMs(dateStr: string): number {
  return Date.parse(dateStr + "T00:00:00Z");
}

/** Whole days from a (earlier) to b (later). Returns negative if a > b. */
export function daysBetweenDays(a: string, b: string): number {
  return Math.round((toUtcMs(b) - toUtcMs(a)) / 86400000);
}

/** Age in whole days since an ISO datetime or date string, relative to `now`. */
export function ageDays(fromIsoOrDate: string): number {
  const from = fromIsoOrDate.length <= 10 ? fromIsoOrDate : fromIsoOrDate.slice(0, 10);
  return daysBetweenDays(from, todayStr());
}

export function addDays(dateStr: string, delta: number): string {
  const d = new Date(toUtcMs(dateStr) + delta * 86400000);
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${d.getUTCFullYear()}-${m}-${day}`;
}

/** Parse a user-entered meter value. Throws a plain Error on bad input. */
export function parseLength(value: unknown, label = "Length"): number {
  const n = typeof value === "number" ? value : parseFloat(String(value ?? ""));
  if (!Number.isFinite(n)) throw new Error(`${label} must be a number (meters).`);
  if (n <= 0) throw new Error(`${label} must be greater than 0.`);
  if (n > 1_000_000) throw new Error(`${label} is unrealistically large.`);
  return roundM(n);
}

export function fmtDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  return dateStr.slice(0, 10);
}
