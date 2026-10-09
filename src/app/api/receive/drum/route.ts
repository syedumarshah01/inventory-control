import { NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { guard, json, jsonError } from "@/lib/api";
import { receiveDrum } from "@/lib/fiber";
import { nextDrumCode } from "@/lib/fiber";

export async function GET(req: NextRequest) {
  const unauth = guard(req);
  if (unauth) return unauth;
  return json({ nextCode: nextDrumCode(getDb()) });
}

export async function POST(req: NextRequest) {
  const unauth = guard(req);
  if (unauth) return unauth;
  try {
    const body = await req.json();
    const result = receiveDrum(getDb(), {
      code: body.code,
      supplier: body.supplier ?? null,
      totalLengthM: Number(body.totalLengthM),
      dateReceived: body.dateReceived || undefined,
      notes: body.notes ?? null,
    });
    return json({ ok: true, ...result });
  } catch (e) {
    return jsonError(e);
  }
}
