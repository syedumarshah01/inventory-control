import { NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { guard, json, jsonError } from "@/lib/api";
import { AppError } from "@/lib/types";

/** Create or update a team. */
export async function POST(req: NextRequest) {
  const unauth = guard(req);
  if (unauth) return unauth;
  try {
    const body = await req.json();
    const db = getDb();
    const name = String(body.name ?? "").trim();
    if (!name) throw new AppError("Team name is required.");
    if (name.length > 60) throw new AppError("Team name must be 60 characters or fewer.");

    if (body.id) {
      const id = Number(body.id);
      const existing = db.prepare("SELECT id FROM teams WHERE id = ?").get(id);
      if (!existing) throw new AppError(`Team #${id} not found.`);
      db.prepare("UPDATE teams SET name = ?, active = ? WHERE id = ?").run(
        name,
        body.active === false ? 0 : 1,
        id
      );
      return json({ ok: true, id });
    }
    const count = db.prepare("SELECT COUNT(*) AS n FROM teams").get() as { n: number };
    if (count.n >= 30) throw new AppError("You already have 30 teams — that is the limit.");
    const r = db
      .prepare("INSERT INTO teams (name, active, created_at) VALUES (?, ?, ?)")
      .run(name, body.active === false ? 0 : 1, new Date().toISOString());
    return json({ ok: true, id: Number(r.lastInsertRowid) });
  } catch (e) {
    return jsonError(e);
  }
}
