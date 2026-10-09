import { NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { guard, json, jsonError } from "@/lib/api";
import { adjustFiber } from "@/lib/fiber";
import type { FiberStatus } from "@/lib/types";

export async function POST(req: NextRequest) {
  const unauth = guard(req);
  if (unauth) return unauth;
  try {
    const body = await req.json();
    adjustFiber(getDb(), {
      pieceId: Number(body.pieceId),
      reason: String(body.reason ?? ""),
      newLengthM:
        body.newLengthM === undefined || body.newLengthM === null || body.newLengthM === ""
          ? undefined
          : Number(body.newLengthM),
      newStatus: (body.newStatus as FiberStatus | undefined) || undefined,
      date: body.date || undefined,
    });
    return json({ ok: true });
  } catch (e) {
    return jsonError(e);
  }
}
