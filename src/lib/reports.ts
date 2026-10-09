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

export function getTeamHistory(db: DB, teamId: number, from: string, to: string) {
  const rows = db
    .prepare(
      `SELECT 'FIBER' AS item_type, fm.type, fm.date, fm.notes, fm.length_m, NULL AS customer_id,
              p.code AS item_code, p.id AS item_id
       FROM fiber_movements fm JOIN fiber_pieces p ON p.id = fm.piece_id
       WHERE fm.team_id = ? AND fm.date >= ? AND fm.date <= ?
       UNION ALL
       SELECT 'ROUTER' AS item_type, rm.type, rm.date, rm.notes, NULL AS length_m, rm.customer_id,
              r.serial_number AS item_code, r.id AS item_id
       FROM router_movements rm JOIN routers r ON r.id = rm.router_id
       WHERE rm.team_id = ? AND rm.date >= ? AND rm.date <= ?
       ORDER BY date DESC, item_code`
    )
    .all(teamId, from, to, teamId, from, to) as Record<string, unknown>[];
  return rows;
}

// ---------------------------------------------------------------------------
// Activity log
// ---------------------------------------------------------------------------

export interface ActivityFilters {
  from?: string;
  to?: string;
  teamId?: number;
  itemType?: "FIBER" | "ROUTER";
  movementType?: string;
  q?: string;
  limit?: number;
}

export function getActivity(db: DB, f: ActivityFilters): Record<string, unknown>[] {
  const limit = Math.min(Math.max(f.limit ?? 200, 1), 1000);

  function build(table: "fm" | "rm", codeCol: string): { where: string; params: (string | number)[] } {
    const conds: string[] = [];
    const params: (string | number)[] = [];
    if (f.from) {
      conds.push(`${table}.date >= ?`);
      params.push(f.from);
    }
    if (f.to) {
      conds.push(`${table}.date <= ?`);
      params.push(f.to);
    }
    if (f.teamId) {
      conds.push(`${table}.team_id = ?`);
      params.push(f.teamId);
    }
    if (f.movementType) {
      conds.push(`${table}.type = ?`);
      params.push(f.movementType);
    }
    if (f.q) {
      conds.push(`${codeCol} LIKE ?`);
      params.push(`%${f.q}%`);
    }
    return { where: conds.length ? `WHERE ${conds.join(" AND ")}` : "", params };
  }

  const fiber = build("fm", "p.code");
  const router = build("rm", "r.serial_number");

  const fiberSql = `SELECT 'FIBER' AS item_type, fm.type, fm.date, fm.notes, fm.length_m, NULL AS customer_id,
            p.code AS item_code, p.id AS item_id, t.name AS team_name
     FROM fiber_movements fm
     JOIN fiber_pieces p ON p.id = fm.piece_id
     LEFT JOIN teams t ON t.id = fm.team_id
     ${fiber.where}`;

  const routerSql = `SELECT 'ROUTER' AS item_type, rm.type, rm.date, rm.notes, NULL AS length_m, rm.customer_id,
            r.serial_number AS item_code, r.id AS item_id, t.name AS team_name
     FROM router_movements rm
     JOIN routers r ON r.id = rm.router_id
     LEFT JOIN teams t ON t.id = rm.team_id
     ${router.where}`;

  let sql: string;
  let sqlParams: (string | number)[];
  if (f.itemType === "FIBER") {
    sql = `SELECT * FROM (${fiberSql}) ORDER BY date DESC, item_type, item_code LIMIT ?`;
    sqlParams = [...fiber.params, limit];
  } else if (f.itemType === "ROUTER") {
    sql = `SELECT * FROM (${routerSql}) ORDER BY date DESC, item_type, item_code LIMIT ?`;
    sqlParams = [...router.params, limit];
  } else {
    sql = `SELECT * FROM (${fiberSql} UNION ALL ${routerSql}) ORDER BY date DESC, item_type, item_code LIMIT ?`;
    sqlParams = [...fiber.params, ...router.params, limit];
  }
  return db.prepare(sql).all(...sqlParams) as Record<string, unknown>[];
}

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------

export interface CableUsageRow {
  team_id: number;
  team: string;
  used_m: number;
  returns: number;
  connections: number;
  m_per_conn: number | null;
  flag: boolean;
}

export function cableUsageReport(db: DB, from: string, to: string): CableUsageRow[] {
  const rows = db
    .prepare(
      `SELECT t.id AS team_id, t.name AS team,
              COALESCE(u.used_m, 0) AS used_m,
              COALESCE(u.returns, 0) AS returns,
              COALESCE(c.connections, 0) AS connections
       FROM teams t
       LEFT JOIN (
         SELECT team_id, SUM(length_m) AS used_m, COUNT(*) AS returns
         FROM fiber_movements
         WHERE type = 'CONSUMED' AND date >= ? AND date <= ? AND team_id IS NOT NULL
         GROUP BY team_id
       ) u ON u.team_id = t.id
       LEFT JOIN (
         SELECT team_id, SUM(connections) AS connections
         FROM daily_connections WHERE date >= ? AND date <= ?
         GROUP BY team_id
       ) c ON c.team_id = t.id
       WHERE t.active = 1 OR u.used_m > 0 OR c.connections > 0
       ORDER BY used_m DESC`
    )
    .all(from, to, from, to) as {
    team_id: number;
    team: string;
    used_m: number;
    returns: number;
    connections: number;
  }[];

  const withRatio = rows.map((r) => ({
    ...r,
    m_per_conn: r.connections > 0 ? Math.round((r.used_m / r.connections) * 100) / 100 : null,
    flag: false,
  }));
  const ratios = withRatio.filter((r) => r.m_per_conn !== null).map((r) => r.m_per_conn as number);
  if (ratios.length > 0) {
    const avg = ratios.reduce((a, b) => a + b, 0) / ratios.length;
    for (const r of withRatio) {
      if (r.m_per_conn !== null && avg > 0 && r.m_per_conn > avg * 1.25) r.flag = true;
    }
  }
  return withRatio;
}

export function routerInstallsReport(db: DB, from: string, to: string) {
  return db
    .prepare(
      `SELECT t.id AS team_id, t.name AS team, COUNT(rm.id) AS installed
       FROM teams t
       LEFT JOIN router_movements rm
         ON rm.team_id = t.id AND rm.type = 'INSTALLED' AND rm.date >= ? AND rm.date <= ?
       GROUP BY t.id
       ORDER BY installed DESC`
    )
    .all(from, to) as { team_id: number; team: string; installed: number }[];
}

export function longestHeldReport(db: DB, limit = 50) {
  const rows = db
    .prepare(
      `SELECT item_type, item_code, item_id, team, days FROM (
         SELECT 'FIBER' AS item_type, p.code AS item_code, p.id AS item_id, t.name AS team,
                CAST(julianday(?) - julianday(i.date) AS INTEGER) AS days
         FROM fiber_pieces p
         JOIN teams t ON t.id = p.current_team_id
         JOIN (SELECT piece_id, MAX(date) AS date FROM fiber_movements WHERE type = 'ISSUED' GROUP BY piece_id) i
           ON i.piece_id = p.id
         WHERE p.status = 'ISSUED'
         UNION ALL
         SELECT 'ROUTER' AS item_type, r.serial_number AS item_code, r.id AS item_id, t.name AS team,
                CAST(julianday(?) - julianday(i.date) AS INTEGER) AS days
         FROM routers r
         JOIN teams t ON t.id = r.current_team_id
         JOIN (SELECT router_id, MAX(date) AS date FROM router_movements WHERE type = 'ISSUED' GROUP BY router_id) i
           ON i.router_id = r.id
         WHERE r.status = 'ISSUED'
       )
       ORDER BY days DESC, item_type, item_code
       LIMIT ?`
    )
    .all(todayStr(), todayStr(), limit) as {
    item_type: string;
    item_code: string;
    item_id: number;
    team: string;
    days: number;
  }[];
  return rows;
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
