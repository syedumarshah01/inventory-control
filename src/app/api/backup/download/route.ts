import fs from "node:fs";
import { NextRequest, NextResponse } from "next/server";
import { dbPath, getDb } from "@/lib/db";
import { guard } from "@/lib/api";

/** One-click download of the live database file. */
export async function GET(req: NextRequest) {
  const unauth = guard(req);
  if (unauth) return unauth;
  getDb().pragma("optimize");
  const data = fs.readFileSync(dbPath());
  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse(new Uint8Array(data), {
    headers: {
      "Content-Type": "application/x-sqlite3",
      "Content-Disposition": `attachment; filename="inventory-${stamp}.db"`,
      "Content-Length": String(data.length),
    },
  });
}
