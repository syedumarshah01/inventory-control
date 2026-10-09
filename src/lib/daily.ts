// Daily Issue / Daily Return — multi-part operations, each atomic (one transaction).

import type { DB } from "./db";
import { AppError } from "./types";
import { isValidDateStr, roundM } from "./dates";
import { issueFiber, returnFiberItems, type FiberIssueItem, type FiberReturnItem } from "./fiber";
import {
  addRoutersBulk,
  closeOutRouters,
  issueRouters,
  parseSerials,
  type RouterCloseoutItem,
} from "./routers";

export interface DailyIssueInput {
  teamId: number;
  date: string;
  notes?: string | null;
  fiber: FiberIssueItem[];
  routerSerials: string[] | string;
}

export function submitDailyIssue(db: DB, input: DailyIssueInput) {
  if (!isValidDateStr(input.date)) throw new AppError("Pick a valid date (YYYY-MM-DD).");
  const serials = Array.isArray(input.routerSerials)
    ? input.routerSerials
    : parseSerials(String(input.routerSerials ?? ""));

  return db.transaction(() => {
    const fiberResult = issueFiber(db, {
      teamId: input.teamId,
      date: input.date,
      notes: input.notes,
      items: input.fiber ?? [],
    });
    let routerResult: { issued: string[] } = { issued: [] };
    if (serials.length > 0) {
      routerResult = issueRouters(db, {
        teamId: input.teamId,
        serials,
        date: input.date,
        notes: input.notes,
      });
    }
    return { fiber: fiberResult, routers: routerResult };
  })();
}

export interface DailyReturnInput {
  teamId: number;
  date: string;
  fiber: FiberReturnItem[];
  routers: RouterCloseoutItem[];
  connections?: number | null;
  notes?: string | null;
}

export interface DailyReturnSummary {
  cable: { issuedM: number; usedM: number; returnedM: number };
  routers: { issued: number; installed: number; returned: number; faulty: number; kept: number };
  remainders: { code: string; lengthM: number; scrapped: boolean }[];
}

export function submitDailyReturn(db: DB, input: DailyReturnInput): DailyReturnSummary {
  if (!isValidDateStr(input.date)) throw new AppError("Pick a valid date (YYYY-MM-DD).");
  if (input.connections !== undefined && input.connections !== null) {
    const c = Number(input.connections);
    if (!Number.isFinite(c) || c < 0 || !Number.isInteger(c)) {
      throw new AppError("Connections completed must be a whole number ≥ 0.");
    }
  }

  return db.transaction(() => {
    // Summary numbers from what the team actually held before the update.
    let issuedM = 0;
    for (const item of input.fiber ?? []) {
      if (item.outcome === "KEPT") continue;
      const row = db.prepare("SELECT length_m FROM fiber_pieces WHERE id = ?").get(item.pieceId) as
        | { length_m: number }
        | undefined;
      if (row) issuedM += row.length_m;
    }
    let routerIssued = 0;
    for (const item of input.routers ?? []) {
      if (item.outcome === "KEPT") continue;
      routerIssued += 1;
    }

    const fiberResult = returnFiberItems(db, {
      teamId: input.teamId,
      date: input.date,
      items: input.fiber ?? [],
    });
    const routerTally = closeOutRouters(db, {
      teamId: input.teamId,
      date: input.date,
      items: input.routers ?? [],
    });

    if (input.connections !== undefined && input.connections !== null) {
      db.prepare(
        `INSERT INTO daily_connections (team_id, date, connections) VALUES (?, ?, ?)
         ON CONFLICT(team_id, date) DO UPDATE SET connections = excluded.connections`
      ).run(input.teamId, input.date, Number(input.connections));
    }

    // The team's day is closed out (even if everything stayed with them).
    db.prepare(
      `INSERT INTO daily_closeouts (team_id, date, closed_at) VALUES (?, ?, ?)
       ON CONFLICT(team_id, date) DO UPDATE SET closed_at = excluded.closed_at`
    ).run(input.teamId, input.date, new Date().toISOString());

    const usedM = fiberResult.consumed.reduce((s, c) => s + c.usedM, 0);
    const returnedM = fiberResult.consumed.reduce((s, c) => s + c.returnedM, 0);

    return {
      cable: { issuedM: roundM(issuedM), usedM: roundM(usedM), returnedM: roundM(returnedM) },
      routers: {
        issued: routerIssued,
        installed: routerTally.installed,
        returned: routerTally.returned,
        faulty: routerTally.faulty,
        kept: routerTally.kept,
      },
      remainders: fiberResult.remainders.map((r) => ({
        code: r.code,
        lengthM: r.lengthM,
        scrapped: r.scrapped,
      })),
    };
  })();
}

/** Re-export for API convenience. */
export { addRoutersBulk };
