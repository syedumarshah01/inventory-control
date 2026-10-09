import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { nextDrumCode } from "@/lib/fiber";
import { todayStr } from "@/lib/dates";
import { ReceiveClient } from "./receive-client";

export const dynamic = "force-dynamic";

export default async function ReceivePage() {
  await requireUser();
  const db = getDb();
  const nextCode = nextDrumCode(db);
  const recentDrums = db
    .prepare("SELECT code, supplier, total_length_m, date_received FROM fiber_drums ORDER BY id DESC LIMIT 5")
    .all() as Record<string, string | number>[];
  return <ReceiveClient nextCode={nextCode} today={todayStr()} recentDrums={recentDrums} />;
}
