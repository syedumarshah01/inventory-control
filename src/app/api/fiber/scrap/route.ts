import { NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { guard, json, jsonError } from "@/lib/api";
import { markScrap } from "@/lib/fiber";

export async function POST(req: NextRequest) {
  const unauth = guard(req);
  if (unauth) return unauth;
  try {
    const body = await req.json();
    markScrap(getDb(), {
      pieceId: Number(body.pieceId),
      reason: String(body.reason ?? ""),
      date: body.date || undefined,
    });
    return json({ ok: true });
  } catch (e) {
    return jsonError(e);
  }
}
