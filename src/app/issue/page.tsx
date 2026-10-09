import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { listFiberPieces } from "@/lib/reports";
import { todayStr } from "@/lib/dates";
import { IssueClient } from "./issue-client";

export const dynamic = "force-dynamic";

export default async function IssuePage() {
  await requireUser();
  const db = getDb();
  const teams = db.prepare("SELECT id, name, active FROM teams ORDER BY id").all() as {
    id: number;
    name: string;
    active: number;
  }[];
  const pool = listFiberPieces(db, "IN_STOCK");
  const routerIndex = db
    .prepare(
      `SELECT r.serial_number, r.status, t.name AS team
       FROM routers r LEFT JOIN teams t ON t.id = r.current_team_id
       ORDER BY r.serial_number`
    )
    .all() as { serial_number: string; status: string; team: string | null }[];

  return <IssueClient teams={teams} pool={pool} routerIndex={routerIndex} today={todayStr()} />;
}
