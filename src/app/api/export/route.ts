import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { guard } from "@/lib/api";
import { toCsv } from "@/lib/csv";
import {
  cableUsageReport,
  getActivity,
  getTeamHistory,
  getTeamHoldings,
  listDrums,
  listFiberPieces,
  listRouters,
  longestHeldReport,
  routerInstallsReport,
} from "@/lib/reports";
import { addDays, todayStr } from "@/lib/dates";

function csvDownload(filename: string, csv: string): NextResponse {
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

/** CSV export for every table and report: /api/export?what=... */
export async function GET(req: NextRequest) {
  const unauth = guard(req);
  if (unauth) return unauth;
  const sp = req.nextUrl.searchParams;
  const what = sp.get("what") ?? "";
  const from = sp.get("from") || addDays(todayStr(), -30);
  const to = sp.get("to") || todayStr();
  const db = getDb();

  switch (what) {
    case "fiber": {
      const status = sp.get("status") || undefined;
      const rows = listFiberPieces(db, status === "ALL" ? undefined : status);
      return csvDownload(
        "fiber-pieces.csv",
        toCsv(
          ["code", "length_m", "status", "drum", "parent", "team", "age_days", "issued_date", "created_at"],
          rows.map((r) => [
            r.code,
            r.length_m,
            r.status,
            r.drum_code,
            r.parent_code ?? "",
            r.team_name ?? "",
            r.age_days,
            r.issued_date ?? "",
            r.created_at,
          ])
        )
      );
    }
    case "drums": {
      const rows = listDrums(db) as Record<string, number | string>[];
      return csvDownload(
        "fiber-drums.csv",
        toCsv(
          ["code", "supplier", "total_length_m", "date_received", "piece_count", "stock_m", "out_m", "used_m", "notes"],
          rows.map((r) => [
            r.code,
            r.supplier ?? "",
            r.total_length_m,
            r.date_received,
            r.piece_count,
            r.stock_m,
            r.out_m,
            r.used_m,
            r.notes ?? "",
          ])
        )
      );
    }
    case "routers": {
      const rows = listRouters(db, {
        status: sp.get("status") || undefined,
        q: sp.get("q") || undefined,
      });
      return csvDownload(
        "routers.csv",
        toCsv(
          ["serial_number", "model", "status", "team", "customer_id", "date_received", "age_days", "issued_date"],
          rows.map((r) => [
            r.serial_number,
            r.model ?? "",
            r.status,
            r.team_name ?? "",
            r.customer_id ?? "",
            r.date_received,
            r.age_days,
            r.issued_date ?? "",
          ])
        )
      );
    }
    case "activity": {
      const teamId = Number(sp.get("teamId")) || undefined;
      const rows = getActivity(db, {
        from,
        to,
        teamId,
        itemType: (sp.get("itemType") as "FIBER" | "ROUTER" | undefined) ?? undefined,
        movementType: sp.get("movementType") || undefined,
        q: sp.get("q") || undefined,
        limit: 1000,
      });
      return csvDownload(
        "activity.csv",
        toCsv(
          ["date", "item_type", "item_code", "movement", "team", "length_m", "customer_id", "notes"],
          rows.map((r) => [
            r.date,
            r.item_type,
            r.item_code,
            r.type,
            r.team_name ?? "",
            r.length_m ?? "",
            r.customer_id ?? "",
            r.notes ?? "",
          ])
        )
      );
    }
    case "report-cable": {
      const rows = cableUsageReport(db, from, to);
      return csvDownload(
        "cable-usage.csv",
        toCsv(
          ["team", "used_m", "returns", "connections", "m_per_connection", "flagged"],
          rows.map((r) => [
            r.team,
            r.used_m,
            r.returns,
            r.connections,
            r.m_per_conn ?? "",
            r.flag ? "YES (>25% above average)" : "no",
          ])
        )
      );
    }
    case "report-installs": {
      const rows = routerInstallsReport(db, from, to);
      return csvDownload(
        "router-installs.csv",
        toCsv(
          ["team", "installed", "from", "to"],
          rows.map((r) => [r.team, r.installed, from, to])
        )
      );
    }
    case "report-longest-held": {
      const rows = longestHeldReport(db, 50);
      return csvDownload(
        "items-held-longest.csv",
        toCsv(
          ["item_type", "item_code", "team", "days_held"],
          rows.map((r) => [r.item_type, r.item_code, r.team, r.days])
        )
      );
    }
    case "team-holdings": {
      const teamId = Number(sp.get("teamId"));
      const h = getTeamHoldings(db, teamId);
      return csvDownload(
        "team-holdings.csv",
        toCsv(
          ["type", "code", "length_m_or_model", "status", "drum"],
          [
            ...(h.fiber as Record<string, unknown>[]).map((f) => [
              "FIBER",
              f.code,
              f.length_m,
              f.status,
              f.drum_code,
            ]),
            ...(h.routers as Record<string, unknown>[]).map((r) => [
              "ROUTER",
              r.serial_number,
              r.model ?? "",
              r.status,
              "",
            ]),
          ]
        )
      );
    }
    case "team-history": {
      const teamId = Number(sp.get("teamId"));
      const rows = getTeamHistory(db, teamId, from, to);
      return csvDownload(
        "team-history.csv",
        toCsv(
          ["date", "item_type", "item_code", "movement", "length_m", "customer_id", "notes"],
          rows.map((r) => [
            r.date,
            r.item_type,
            r.item_code,
            r.type,
            r.length_m ?? "",
            r.customer_id ?? "",
            r.notes ?? "",
          ])
        )
      );
    }
    default:
      return new NextResponse(`Unknown export "${what}"`, { status: 400 });
  }
}
