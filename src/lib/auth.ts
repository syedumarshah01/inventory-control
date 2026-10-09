// Single-user auth: one password, HMAC-signed session cookie.
// Password source of truth: settings.password_hash if set (changed in Settings),
// otherwise the AUTH_PASSWORD environment variable (default "changeme").

import crypto from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { DB } from "./db";
import { getDb } from "./db";
import { getSetting, getSessionSecret, setSetting } from "./settings";

export const SESSION_COOKIE = "it_session";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function envPassword(): string {
  return process.env.AUTH_PASSWORD || "changeme";
}

function sha256Hex(s: string): string {
  return crypto.createHash("sha256").update(s).digest("hex");
}

function timingSafeEq(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

function hashPassword(pw: string, salt: string): string {
  return crypto.scryptSync(pw, salt, 32).toString("hex");
}

export function verifyPassword(db: DB, pw: string): boolean {
  const stored = getSetting(db, "password_hash");
  if (stored) {
    const [salt, hash] = stored.split(":");
    if (!salt || !hash) return false;
    return timingSafeEq(hashPassword(pw, salt), hash);
  }
  return timingSafeEq(sha256Hex(pw), sha256Hex(envPassword()));
}

export function changePassword(db: DB, current: string, next: string): void {
  if (!verifyPassword(db, current)) {
    throw new Error("Current password is incorrect.");
  }
  if (typeof next !== "string" || next.length < 4) {
    throw new Error("New password must be at least 4 characters.");
  }
  const salt = crypto.randomBytes(16).toString("hex");
  setSetting(db, "password_hash", `${salt}:${hashPassword(next, salt)}`);
}

export function createSessionToken(db: DB): string {
  const secret = getSessionSecret(db);
  const exp = String(Date.now() + SESSION_TTL_MS);
  const sig = crypto.createHmac("sha256", secret).update(exp).digest("hex");
  return `${exp}.${sig}`;
}

export function validateSessionToken(db: DB, token: string | undefined): boolean {
  if (!token) return false;
  const dot = token.indexOf(".");
  if (dot <= 0) return false;
  const exp = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expMs = parseInt(exp, 10);
  if (!Number.isFinite(expMs) || expMs < Date.now()) return false;
  const secret = getSessionSecret(db);
  const expected = crypto.createHmac("sha256", secret).update(exp).digest("hex");
  return timingSafeEq(sig, expected);
}

/** For server components / pages: redirect to /login when not authenticated. */
export async function requireUser(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!validateSessionToken(getDb(), token)) {
    redirect("/login");
  }
}

/** For API route handlers: returns true when the request carries a valid session. */
export function isApiAuthenticated(req: Request): boolean {
  const header = req.headers.get("cookie") || "";
  const match = header
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(SESSION_COOKIE + "="));
  const token = match ? decodeURIComponent(match.slice(SESSION_COOKIE.length + 1)) : undefined;
  return validateSessionToken(getDb(), token);
}
