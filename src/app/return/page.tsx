import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { todayStr } from "@/lib/dates";
import { ReturnClient } from "./return-client";

export const dynamic = "force-dynamic";

export default async function ReturnPage() {
  await requireUser();
  const db = getDb();
  const teams = db.prepare("SELECT id, name, active FROM teams ORDER BY id").all() as {
    id: number;
    name: string;
    active: number;
  }[];
  const settings = getSettings(db);
  return <ReturnClient teams={teams} settings={settings} today={todayStr()} />;
}
