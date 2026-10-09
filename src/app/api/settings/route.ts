import { NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { guard, json, jsonError } from "@/lib/api";
import { getSettings, saveSettings } from "@/lib/settings";

export async function GET(req: NextRequest) {
  const unauth = guard(req);
  if (unauth) return unauth;
  return json(getSettings(getDb()));
}

export async function PUT(req: NextRequest) {
  const unauth = guard(req);
  if (unauth) return unauth;
  try {
    const body = await req.json();
    const next = saveSettings(getDb(), {
      scrapThresholdM: body.scrapThresholdM === undefined ? undefined : Number(body.scrapThresholdM),
      lowStockThreshold:
        body.lowStockThreshold === undefined ? undefined : Number(body.lowStockThreshold),
      overdueDays: body.overdueDays === undefined ? undefined : Number(body.overdueDays),
    });
    return json({ ok: true, settings: next });
  } catch (e) {
    return jsonError(e);
  }
}
