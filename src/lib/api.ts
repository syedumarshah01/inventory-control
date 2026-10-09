// Small helpers shared by API route handlers.

import { NextResponse } from "next/server";
import { AppError } from "./types";
import { isApiAuthenticated } from "./auth";

export function json(data: unknown, status = 200): NextResponse {
  return NextResponse.json(data, { status });
}

export function jsonError(e: unknown): NextResponse {
  if (e instanceof AppError) {
    return NextResponse.json({ error: e.message }, { status: e.status });
  }
  if (e instanceof Error) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
  return NextResponse.json({ error: "Unexpected server error." }, { status: 500 });
}

/** Returns a 401 response when the request is not authenticated, else null. */
export function guard(req: Request): NextResponse | null {
  if (!isApiAuthenticated(req)) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  return null;
}

export function requireBodyField(body: Record<string, unknown>, key: string): unknown {
  const v = body[key];
  if (v === undefined || v === null || v === "") {
    throw new AppError(`"${key}" is required.`);
  }
  return v;
}
