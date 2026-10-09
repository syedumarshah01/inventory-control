import { NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { guard, json, jsonError } from "@/lib/api";
import { adjustRouter, returnRouterToSupplier } from "@/lib/routers";
import type { RouterStatus } from "@/lib/types";

export async function POST(req: NextRequest) {
  const unauth = guard(req);
  if (unauth) return unauth;
  try {
    const body = await req.json();
    const routerId = Number(body.routerId);
    const reason = String(body.reason ?? "");
    if (body.action === "RETURN_TO_SUPPLIER") {
      returnRouterToSupplier(getDb(), { routerId, reason, date: body.date || undefined });
      return json({ ok: true });
    }
    adjustRouter(getDb(), {
      routerId,
      reason,
      newStatus: (body.newStatus as RouterStatus | undefined) || undefined,
      newModel: body.newModel === undefined ? undefined : String(body.newModel),
      customerId:
        body.customerId === undefined ? undefined : body.customerId === null ? null : String(body.customerId),
      date: body.date || undefined,
    });
    return json({ ok: true });
  } catch (e) {
    return jsonError(e);
  }
}
