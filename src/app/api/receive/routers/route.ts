import { NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { guard, json, jsonError } from "@/lib/api";
import { addRoutersBulk, parseSerials, previewBulkRouters } from "@/lib/routers";

export async function POST(req: NextRequest) {
  const unauth = guard(req);
  if (unauth) return unauth;
  try {
    const body = await req.json();
    const serials: string[] = Array.isArray(body.serials)
      ? body.serials.map((s: unknown) => String(s))
      : parseSerials(String(body.text ?? ""));

    // Preview mode: validate and flag duplicates without saving.
    if (body.preview === true) {
      return json({ ok: true, ...previewBulkRouters(getDb(), serials) });
    }

    const result = addRoutersBulk(getDb(), {
      serials,
      model: body.model ?? null,
      dateReceived: body.dateReceived || undefined,
      notes: body.notes ?? null,
    });
    return json({ ok: true, ...result });
  } catch (e) {
    return jsonError(e);
  }
}
