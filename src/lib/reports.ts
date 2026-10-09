// Read-side queries: dashboard, fiber pool, router inventory, team ledger,
// reports, activity log.

import type { DB } from "./db";
import { getSettings } from "./settings";
import { ageDays, todayStr } from "./dates";

export interface DashboardData {
  routers: { inStock: number; withTeams: number; installedToday: number; faulty: number };
  fiber: { inStockM: number; poolPieces: number; outM: number; outPieces: number };
  teams: {
    id: number;
    name: string;
    active: number;
    routersHeld: number;
    fiberHeldM: number;
    fiberPieces: number;
    oldestDays: number | null;
    closedOutToday: boolean;
  }[];
  alerts: { kind: string; message: string; severity: "warn" | "error" | "info" }[];
  settings: { scrapThresholdM: number; lowStockThreshold: number; overdueDays: number };
}

export function getDashboardData(db: DB): DashboardData {
  const settings = getSettings(db);
  const today = todayStr();

  const routerCounts = db
    .prepare(
      `SELECT
         SUM(CASE WHEN status = 'IN_STOCK' THEN 1 ELSE 0 END) AS in_stock,
         SUM(CASE WHEN status = 'ISSUED' THEN 1 ELSE 0 END) AS with_teams,
         SUM(CASE WHEN status = 'FAULTY' THEN 1 ELSE 0 END) AS faulty
       FROM routers`
    )
    .get() as { in_stock: number | null; with_teams: number | null; faulty: number | null };

  const installedToday = db
    .prepare(
      `SELECT COUNT(*) AS n FROM router_movements WHERE type = 'INSTALLED' AND date = ?`
    )
    .get(today) as { n: number };

  const fiberStock = db
    .prepare(
      `SELECT
         SUM(CASE WHEN status = 'IN_STOCK' THEN length_m ELSE 0 END) AS stock_m,
         SUM(CASE WHEN status = 'IN_STOCK' THEN 1 ELSE 0 END) AS pool_pieces,
         SUM(CASE WHEN status = 'ISSUED' THEN length_m ELSE 0 END) AS out_m,
         SUM(CASE WHEN status = 'ISSUED' THEN 1 ELSE 0 END) AS out_pieces
       FROM fiber_pieces`
    )
    .get() as {
    stock_m: number | null;
    pool_pieces: number | null;
    out_m: number | null;
    out_pieces: number | null;
  };

  const teams = (
    db.prepare("SELECT id, name, active FROM teams ORDER BY id").all() as {
      id: number;
      name: string;
      active: number;
    }[]
  ).map((t) => {
    const r = db
      .prepare("SELECT COUNT(*) AS n FROM routers WHERE current_team_id = ? AND status = 'ISSUED'")
      .get(t.id) as { n: number };
    const f = db
      .prepare(
        `SELECT COALESCE(SUM(length_m), 0) AS m, COUNT(*) AS n
         FROM fiber_pieces WHERE current_team_id = ? AND status = 'ISSUED'`
      )
      .get(t.id) as { m: number; n: number };
    const oldest = db
      .prepare(
        `SELECT MIN(date) AS d FROM (
           SELECT date FROM fiber_movements
             WHERE team_id = ? AND type = 'ISSUED' AND piece_id IN
               (SELECT id FROM fiber_pieces WHERE current_team_id = ? AND status = 'ISSUED')
           UNION ALL
           SELECT date FROM router_movements
             WHERE team_id = ? AND type = 'ISSUED' AND router_id IN
               (SELECT id FROM routers WHERE current_team_id = ? AND status = 'ISSUED')
         )`
      )
      .get(t.id, t.id, t.id, t.id) as { d: string | null };
    const closed = db
      .prepare("SELECT 1 FROM daily_closeouts WHERE team_id = ? AND date = ?")
      .get(t.id, today);
    return {
      id: t.id,
      name: t.name,
      active: t.active,
      routersHeld: r.n,
      fiberHeldM: f.m,
      fiberPieces: f.n,
      oldestDays: oldest.d ? ageDays(oldest.d) : null,
      closedOutToday: !!closed,
    };
  });

  // ----- Alerts -----
  const alerts: DashboardData["alerts"] = [];
  const overdue = settings.overdueDays;

  const overdueFiber = db
    .prepare(
      `SELECT p.code, t.name AS team, fm.date
       FROM fiber_pieces p
       JOIN (SELECT piece_id, MAX(date) AS date FROM fiber_movements
             WHERE type = 'ISSUED' GROUP BY piece_id) fm ON fm.piece_id = p.id
       JOIN teams t ON t.id = p.current_team_id
       WHERE p.status = 'ISSUED' AND julianday(?) - julianday(fm.date) > ?`
    )
    .all(today, overdue) as { code: string; team: string; date: string }[];
  for (const row of overdueFiber.slice(0, 20)) {
    alerts.push({
      kind: "overdue-fiber",
      severity: "warn",
      message: `Fiber ${row.code} has been with ${row.team} for ${ageDays(row.date)} days (limit ${overdue}).`,
    });
  }

  const overdueRouters = db
    .prepare(
      `SELECT r.serial_number, t.name AS team, rm.date
       FROM routers r
       JOIN (SELECT router_id, MAX(date) AS date FROM router_movements
             WHERE type = 'ISSUED' GROUP BY router_id) rm ON rm.router_id = r.id
       JOIN teams t ON t.id = r.current_team_id
       WHERE r.status = 'ISSUED' AND julianday(?) - julianday(rm.date) > ?`
    )
    .all(today, overdue) as { serial_number: string; team: string; date: string }[];
  for (const row of overdueRouters.slice(0, 20)) {
    alerts.push({
      kind: "overdue-router",
      severity: "warn",
      message: `Router ${row.serial_number} has been with ${row.team} for ${ageDays(row.date)} days (limit ${overdue}).`,
    });
  }

  const inStock = (routerCounts.in_stock ?? 0) as number;
  if (inStock < settings.lowStockThreshold) {
    alerts.push({
      kind: "low-stock",
      severity: "error",
      message: `Low router stock: ${inStock} in stock (threshold ${settings.lowStockThreshold}).`,
    });
  }

  for (const t of teams) {
    const holds = t.routersHeld + t.fiberPieces > 0;
    if (t.active && holds && !t.closedOutToday) {
      alerts.push({
        kind: "not-closed-out",
        severity: "info",
        message: `${t.name} has items out and has not been closed out for today.`,
      });
    }
  }

  return {
    routers: {
      inStock: inStock,
      withTeams: routerCounts.with_teams ?? 0,
      installedToday: installedToday.n,
      faulty: routerCounts.faulty ?? 0,
    },
    fiber: {
      inStockM: fiberStock.stock_m ?? 0,
      poolPieces: fiberStock.pool_pieces ?? 0,
      outM: fiberStock.out_m ?? 0,
      outPieces: fiberStock.out_pieces ?? 0,
    },
    teams,
    alerts,
    settings,
  };
}

// ---------------------------------------------------------------------------
// Fiber pool / drums
// ---------------------------------------------------------------------------

export interface PoolRow {
  id: number;
  code: string;
  length_m: number;
  status: string;
  drum_code: string;
  parent_code: string | null;
  team_name: string | null;
  created_at: string;
  age_days: number;
  issued_date: string | null;
}

export function listFiberPieces(db: DB, status?: string): PoolRow[] {
  const where = status ? "WHERE p.status = ?" : "";
  const rows = db
    .prepare(
      `SELECT p.*, d.code AS drum_code, pp.code AS parent_code, t.name AS team_name
       FROM fiber_pieces p
       JOIN fiber_drums d ON d.id = p.drum_id
       LEFT JOIN fiber_pieces pp ON pp.id = p.parent_piece_id
       LEFT JOIN teams t ON t.id = p.current_team_id
       ${where}
       ORDER BY p.length_m ASC, p.id DESC`
    )
    .all(...(status ? [status] : [])) as (Omit<PoolRow, "age_days" | "issued_date"> & {
    created_at: string;
  })[];

  const issueDates = new Map<number, string>();
  const im = db
    .prepare(
      `SELECT piece_id, MAX(date) AS d FROM fiber_movements WHERE type = 'ISSUED' GROUP BY piece_id`
    )
    .all() as { piece_id: number; d: string }[];
  for (const r of im) issueDates.set(r.piece_id, r.d);

  return rows.map((r) => ({
    ...r,
    age_days: ageDays(r.created_at),
    issued_date: issueDates.get(r.id) ?? null,
  }));
}

export function listDrums(db: DB) {
  return db
    .prepare(
      `SELECT d.*,
        (SELECT COUNT(*) FROM fiber_pieces p WHERE p.drum_id = d.id) AS piece_count,
        (SELECT COALESCE(SUM(length_m), 0) FROM fiber_pieces p WHERE p.drum_id = d.id AND p.status = 'IN_STOCK') AS stock_m,
        (SELECT COALESCE(SUM(length_m), 0) FROM fiber_pieces p WHERE p.drum_id = d.id AND p.status = 'ISSUED') AS out_m,
        (SELECT COALESCE(SUM(length_m), 0) FROM fiber_pieces p WHERE p.drum_id = d.id AND p.status = 'CONSUMED') AS used_m
       FROM fiber_drums d ORDER BY d.id DESC`
    )
    .all();
}

// ---------------------------------------------------------------------------
// Piece / router detail
// ---------------------------------------------------------------------------

export function getPieceDetail(db: DB, id: number) {
  const piece = db
    .prepare(
      `SELECT p.*, d.code AS drum_code, d.supplier, d.total_length_m, d.date_received AS drum_received,
              t.name AS team_name
       FROM fiber_pieces p
       JOIN fiber_drums d ON d.id = p.drum_id
       LEFT JOIN teams t ON t.id = p.current_team_id
       WHERE p.id = ?`
    )
    .get(id) as Record<string, unknown> | undefined;
  if (!piece) return null;

  const movements = db
    .prepare(
      `SELECT fm.*, t.name AS team_name
       FROM fiber_movements fm LEFT JOIN teams t ON t.id = fm.team_id
       WHERE fm.piece_id = ? ORDER BY fm.date ASC, fm.id ASC`
    )
    .all(id);

  const children = db
    .prepare("SELECT id, code, length_m, status FROM fiber_pieces WHERE parent_piece_id = ? ORDER BY id")
    .all(id);

  // Walk up the lineage.
  const lineage: { id: number; code: string; length_m: number }[] = [];
  let parentId = piece.parent_piece_id as number | null;
  const guard = new Set<number>();
  while (parentId && !guard.has(parentId)) {
    guard.add(parentId);
    const parent = db
      .prepare("SELECT id, code, length_m, parent_piece_id FROM fiber_pieces WHERE id = ?")
      .get(parentId) as
      | { id: number; code: string; length_m: number; parent_piece_id: number | null }
      | undefined;
    if (!parent) break;
    lineage.unshift({ id: parent.id, code: parent.code, length_m: parent.length_m });
    parentId = parent.parent_piece_id;
  }

  return { piece, movements, children, lineage };
}

export function getRouterDetail(db: DB, id: number) {
  const router = db
    .prepare("SELECT r.*, t.name AS team_name FROM routers r LEFT JOIN teams t ON t.id = r.current_team_id WHERE r.id = ?")
    .get(id) as Record<string, unknown> | undefined;
  if (!router) return null;
  const movements = db
    .prepare(
      `SELECT rm.*, t.name AS team_name
       FROM router_movements rm LEFT JOIN teams t ON t.id = rm.team_id
       WHERE rm.router_id = ? ORDER BY rm.date ASC, rm.id ASC`
    )
    .all(id);
  return { router, movements };
}

// ---------------------------------------------------------------------------
// Team holdings & ledger
// ---------------------------------------------------------------------------

export function getTeamHoldings(db: DB, teamId: number) {
  const fiber = db
    .prepare(
      `SELECT p.*, d.code AS drum_code
       FROM fiber_pieces p JOIN fiber_drums d ON d.id = p.drum_id
       WHERE p.current_team_id = ? AND p.status = 'ISSUED'
       ORDER BY p.created_at ASC`
    )
    .all(teamId) as Record<string, unknown>[];
  const routers = db
    .prepare(
      `SELECT * FROM routers WHERE current_team_id = ? AND status = 'ISSUED' ORDER BY id`
    )
    .all(teamId) as Record<string, unknown>[];
  return { fiber, routers };
}

// ---------------------------------------------------------------------------
// Router inventory list
// ---------------------------------------------------------------------------

export interface RouterRow {
  id: number;
  serial_number: string;
  model: string | null;
  status: string;
  team_name: string | null;
  customer_id: string | null;
  date_received: string;
  age_days: number;
  issued_date: string | null;
}

export function listRouters(db: DB, opts: { status?: string; q?: string } = {}): RouterRow[] {
  const conds: string[] = [];
  const params: (string | number)[] = [];
  if (opts.status && opts.status !== "ALL") {
    conds.push("r.status = ?");
    params.push(opts.status);
  }
  if (opts.q) {
    conds.push("r.serial_number LIKE ?");
    params.push(`%${opts.q}%`);
  }
  const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";
  const rows = db
    .prepare(
      `SELECT r.*, t.name AS team_name FROM routers r
       LEFT JOIN teams t ON t.id = r.current_team_id
       ${where}
       ORDER BY r.id DESC`
    )
    .all(...params) as (Omit<RouterRow, "age_days" | "issued_date">)[];

  const issueDates = new Map<number, string>();
  const im = db
    .prepare(
      `SELECT router_id, MAX(date) AS d FROM router_movements WHERE type = 'ISSUED' GROUP BY router_id`
    )
    .all() as { router_id: number; d: string }[];
  for (const r of im) issueDates.set(r.router_id, r.d);

  return rows.map((r) => ({
    ...r,
    age_days: ageDays(r.date_received),
    issued_date: issueDates.get(r.id) ?? null,
  }));
}

export function routerStatusCounts(db: DB): Record<string, number> {
  const rows = db.prepare("SELECT status, COUNT(*) AS n FROM routers GROUP BY status").all() as {
    status: string;
    n: number;
  }[];
  const out: Record<string, number> = { ALL: 0 };
  for (const r of rows) {
    out[r.status] = r.n;
    out.ALL += r.n;
  }
  return out;
}
