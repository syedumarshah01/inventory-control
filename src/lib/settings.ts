// App settings stored in the settings table (single row per key).

import crypto from "node:crypto";
import type { DB } from "./db";

export interface AppSettings {
  scrapThresholdM: number;
  lowStockThreshold: number;
  overdueDays: number;
}

export const DEFAULT_SETTINGS: AppSettings = {
  scrapThresholdM: 10,
  lowStockThreshold: 5,
  overdueDays: 2,
};

export function getSetting(db: DB, key: string): string | undefined {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as
    | { value: string }
    | undefined;
  return row?.value;
}

export function setSetting(db: DB, key: string, value: string): void {
  db.prepare(
    "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
  ).run(key, value);
}

function numSetting(db: DB, key: string, fallback: number): number {
  const v = getSetting(db, key);
  if (v === undefined) return fallback;
  const n = parseFloat(v);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

export function getSettings(db: DB): AppSettings {
  return {
    scrapThresholdM: numSetting(db, "scrapThresholdM", DEFAULT_SETTINGS.scrapThresholdM),
    lowStockThreshold: numSetting(db, "lowStockThreshold", DEFAULT_SETTINGS.lowStockThreshold),
    overdueDays: numSetting(db, "overdueDays", DEFAULT_SETTINGS.overdueDays),
  };
}

export function saveSettings(db: DB, input: Partial<AppSettings>): AppSettings {
  const current = getSettings(db);
  const next: AppSettings = { ...current };
  if (input.scrapThresholdM !== undefined) {
    const n = Number(input.scrapThresholdM);
    if (!Number.isFinite(n) || n < 0 || n > 10000) throw new Error("Scrap threshold must be between 0 and 10000 meters.");
    next.scrapThresholdM = n;
    setSetting(db, "scrapThresholdM", String(n));
  }
  if (input.lowStockThreshold !== undefined) {
    const n = Number(input.lowStockThreshold);
    if (!Number.isFinite(n) || n < 0 || n > 10000 || !Number.isInteger(n)) throw new Error("Low stock threshold must be a whole number ≥ 0.");
    next.lowStockThreshold = n;
    setSetting(db, "lowStockThreshold", String(n));
  }
  if (input.overdueDays !== undefined) {
    const n = Number(input.overdueDays);
    if (!Number.isFinite(n) || n < 1 || n > 365 || !Number.isInteger(n)) throw new Error("Overdue days must be a whole number between 1 and 365.");
    next.overdueDays = n;
    setSetting(db, "overdueDays", String(n));
  }
  return next;
}

/** Per-connection random secret used to sign session cookies. */
export function getSessionSecret(db: DB): string {
  let secret = getSetting(db, "session_secret");
  if (!secret) {
    secret = crypto.randomBytes(32).toString("hex");
    setSetting(db, "session_secret", secret);
  }
  return secret;
}
