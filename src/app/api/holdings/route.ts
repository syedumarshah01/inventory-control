import { NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { guard, json } from "@/lib/api";
import { getTeamHoldings } from "@/lib/reports";

/** Everything a team currently holds (fiber + routers) — powers the Daily Return screen. */
export async function GET(req: NextRequest) {
  const unauth = guard(req);
  if (unauth) return unauth;
  const teamId = Number(req.nextUrl.searchParams.get("teamId"));
  if (!Number.isFinite(teamId) || teamId <= 0) {
    return json({ error: "teamId is required." }, 400);
  }
  return json(getTeamHoldings(getDb(), teamId));
}
