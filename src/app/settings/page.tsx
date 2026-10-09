import fs from "node:fs";
import path from "node:path";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { SettingsClient } from "./settings-client";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  await requireUser();
  const db = getDb();
  const teams = db.prepare("SELECT id, name, active FROM teams ORDER BY id").all() as {
    id: number;
    name: string;
    active: number;
  }[];
  const settings = getSettings(db);

  let backups: string[] = [];
  try {
    backups = fs
      .readdirSync(path.join(process.cwd(), "backups"))
      .filter((f) => f.endsWith(".db"))
      .sort()
      .reverse()
      .slice(0, 10);
  } catch {
    backups = [];
  }

  return <SettingsClient teams={teams} settings={settings} backups={backups} />;
}
