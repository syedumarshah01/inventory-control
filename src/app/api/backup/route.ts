import path from "node:path";
import { NextRequest } from "next/server";
import { backupDatabase, getDb } from "@/lib/db";
import { guard, json, jsonError } from "@/lib/api";

/** Create a backup now (copies the SQLite file into backups/). */
export async function POST(req: NextRequest) {
  const unauth = guard(req);
  if (unauth) return unauth;
  try {
    const dest = backupDatabase(getDb());
    return json({ ok: true, file: path.basename(dest) });
  } catch (e) {
    return jsonError(e);
  }
}
