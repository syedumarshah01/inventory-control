import { NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { guard, json, jsonError } from "@/lib/api";
import { submitDailyReturn } from "@/lib/daily";
import type { FiberReturnItem } from "@/lib/fiber";
import type { RouterCloseoutItem } from "@/lib/routers";

export async function POST(req: NextRequest) {
  const unauth = guard(req);
  if (unauth) return unauth;
  try {
    const body = await req.json();
    const fiber: FiberReturnItem[] = Array.isArray(body.fiber)
      ? body.fiber.map((f: Record<string, unknown>) => ({
          pieceId: Number(f.pieceId),
          outcome:
            f.outcome === "SCRAP" ? ("SCRAP" as const) : f.outcome === "KEPT" ? ("KEPT" as const) : ("RETURNED" as const),
          remainingM:
            f.remainingM === undefined || f.remainingM === null || f.remainingM === ""
              ? undefined
              : Number(f.remainingM),
        }))
      : [];
    const routers: RouterCloseoutItem[] = Array.isArray(body.routers)
      ? body.routers.map((r: Record<string, unknown>) => ({
          routerId: Number(r.routerId),
          outcome:
            r.outcome === "INSTALLED"
              ? ("INSTALLED" as const)
              : r.outcome === "RETURNED"
                ? ("RETURNED" as const)
                : r.outcome === "FAULTY"
                  ? ("FAULTY" as const)
                  : ("KEPT" as const),
          customerId: r.customerId === undefined || r.customerId === null ? null : String(r.customerId),
        }))
      : [];
    const summary = submitDailyReturn(getDb(), {
      teamId: Number(body.teamId),
      date: String(body.date ?? ""),
      fiber,
      routers,
      connections:
        body.connections === undefined || body.connections === null || body.connections === ""
          ? null
          : Number(body.connections),
    });
    return json({ ok: true, summary });
  } catch (e) {
    return jsonError(e);
  }
}
