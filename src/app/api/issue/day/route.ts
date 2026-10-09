import { NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { guard, json, jsonError } from "@/lib/api";
import { submitDailyIssue } from "@/lib/daily";
import type { FiberIssueItem } from "@/lib/fiber";

export async function POST(req: NextRequest) {
  const unauth = guard(req);
  if (unauth) return unauth;
  try {
    const body = await req.json();
    const fiber: FiberIssueItem[] = Array.isArray(body.fiber)
      ? body.fiber.map((f: Record<string, unknown>) => ({
          pieceId: Number(f.pieceId),
          mode: f.mode === "PARTIAL" ? ("PARTIAL" as const) : ("WHOLE" as const),
          lengthM: f.lengthM === undefined || f.lengthM === null ? undefined : Number(f.lengthM),
        }))
      : [];
    const result = submitDailyIssue(getDb(), {
      teamId: Number(body.teamId),
      date: String(body.date ?? ""),
      notes: body.notes ?? null,
      fiber,
      routerSerials: body.routerSerials ?? [],
    });
    return json({ ok: true, ...result });
  } catch (e) {
    return jsonError(e);
  }
}
