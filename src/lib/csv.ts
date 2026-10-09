// CSV helpers for exporting any table/report.

export function toCsv(headers: string[], rows: unknown[][]): string {
  const escape = (v: unknown): string => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.map(escape).join(",")];
  for (const row of rows) lines.push(row.map(escape).join(","));
  return lines.join("\r\n") + "\r\n";
}

export function csvHeaders(): Record<string, string> {
  return {
    "Content-Type": "text/csv; charset=utf-8",
  };
}
