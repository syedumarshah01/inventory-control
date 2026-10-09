// Pure link helper — safe to use from both server and client components.

export function downloadHref(
  what: string,
  params: Record<string, string | number | undefined> = {}
): string {
  const sp = new URLSearchParams({ what });
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "") sp.set(k, String(v));
  }
  return `/api/export?${sp.toString()}`;
}
