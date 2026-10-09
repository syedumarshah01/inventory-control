import { NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { guard, json, jsonError } from "@/lib/api";
import { changePassword } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const unauth = guard(req);
  if (unauth) return unauth;
  try {
    const body = await req.json();
    changePassword(getDb(), String(body.current ?? ""), String(body.next ?? ""));
    return json({ ok: true });
  } catch (e) {
    return jsonError(e);
  }
}
