import { NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { guard, json } from "@/lib/api";

/** Serial autocomplete for fast data entry. */
export async function GET(req: NextRequest) {
  const unauth = guard(req);
  if (unauth) return unauth;
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (!q) return json({ results: [] });
  const rows = getDb()
    .prepare(
      `SELECT r.serial_number, r.status, r.model, t.name AS team
       FROM routers r LEFT JOIN teams t ON t.id = r.current_team_id
       WHERE r.serial_number LIKE ?
       ORDER BY (r.status = 'IN_STOCK') DESC, r.serial_number
       LIMIT 10`
    )
    .all(`%${q}%`) as { serial_number: string; status: string; model: string | null; team: string | null }[];
  return json({ results: rows });
}
