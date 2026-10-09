// Router domain logic: bulk receive, issue to teams, daily close-out outcomes,
// corrections. Movements mirror the piece movements — nothing is hard-deleted.

import type { DB } from "./db";
import {
  AppError,
  type Router,
  type RouterMovementType,
  type RouterStatus,
} from "./types";
import { todayStr } from "./dates";

function movement(
  db: DB,
  routerId: number,
  type: RouterMovementType,
  opts: {
    teamId?: number | null;
    customerId?: string | null;
    date: string;
    notes?: string | null;
  }
): void {
  db.prepare(
    `INSERT INTO router_movements (router_id, type, team_id, customer_id, date, notes)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(
    routerId,
    type,
    opts.teamId ?? null,
    opts.customerId ?? null,
    opts.date,
    opts.notes ?? null
  );
}

function getRouter(db: DB, id: number): Router {
  const r = db.prepare("SELECT * FROM routers WHERE id = ?").get(id) as Router | undefined;
  if (!r) throw new AppError(`Router #${id} not found.`);
  return r;
}

function teamName(db: DB, teamId: number | null): string {
  if (!teamId) return "no team";
  const t = db.prepare("SELECT name FROM teams WHERE id = ?").get(teamId) as
    | { name: string }
    | undefined;
  return t?.name ?? `team #${teamId}`;
}

/** Split pasted serials on newlines, commas, semicolons, spaces. */
export function parseSerials(text: string): string[] {
  return text
    .split(/[\s,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function describeStatus(db: DB, r: Router): string {
  switch (r.status) {
    case "ISSUED":
      return `already issued to ${teamName(db, r.current_team_id)}`;
    case "INSTALLED":
      return `already installed${r.customer_id ? ` (customer ${r.customer_id})` : ""}`;
    case "FAULTY":
      return "marked FAULTY";
    case "RETURNED_TO_SUPPLIER":
      return "returned to supplier";
    default:
      return r.status;
  }
}

// ---------------------------------------------------------------------------
// Bulk receive
// ---------------------------------------------------------------------------

export interface BulkRouterResult {
  added: { id: number; serial: string }[];
  duplicatesInInput: string[];
  alreadyInSystem: { serial: string; status: string }[];
}

/** Pre-validate a bulk paste without saving — used by the preview step. */
export function previewBulkRouters(db: DB, serials: string[]): BulkRouterResult {
  const seen = new Set<string>();
  const duplicatesInInput: string[] = [];
  const unique: string[] = [];
  for (const raw of serials) {
    const s = raw.trim();
    if (!s) continue;
    if (seen.has(s)) {
      if (!duplicatesInInput.includes(s)) duplicatesInInput.push(s);
      continue;
    }
    seen.add(s);
    unique.push(s);
  }
  const alreadyInSystem: { serial: string; status: string }[] = [];
  for (const s of unique) {
    const row = db.prepare("SELECT status FROM routers WHERE serial_number = ?").get(s) as
      | { status: string }
      | undefined;
    if (row) alreadyInSystem.push({ serial: s, status: row.status });
  }
  return { added: [], duplicatesInInput, alreadyInSystem };
}

/**
 * Add routers in bulk. Rejects (with a clear message) any duplicate serial in the
 * input or any serial already in the system — the user fixes the list first.
 */
export function addRoutersBulk(
  db: DB,
  input: { serials: string[]; model?: string | null; dateReceived?: string; notes?: string | null }
): { count: number; serials: string[] } {
  return db.transaction(() => {
    const serials = input.serials.map((s) => s.trim()).filter(Boolean);
    if (serials.length === 0) throw new AppError("Enter at least one serial number.");

    const preview = previewBulkRouters(db, serials);
    if (preview.duplicatesInInput.length > 0) {
      throw new AppError(
        `Duplicate serials in your input: ${preview.duplicatesInInput.join(", ")}. Remove the extras first.`
      );
    }
    if (preview.alreadyInSystem.length > 0) {
      throw new AppError(
        `Already in the system: ${preview.alreadyInSystem
          .map((d) => `${d.serial} (${d.status})`)
          .join(", ")}. Remove them before saving.`
      );
    }
    for (const s of serials) {
      if (s.length > 100) throw new AppError(`Serial "${s.slice(0, 40)}…" is too long (max 100).`);
    }

    const date = input.dateReceived ?? todayStr();
    const model = (input.model ?? "").trim() || null;
    const notes = (input.notes ?? "").trim() || null;
    const insert = db.prepare(
      `INSERT INTO routers (serial_number, model, status, current_team_id, customer_id, date_received, notes)
       VALUES (?, ?, 'IN_STOCK', NULL, NULL, ?, ?)`
    );
    const added: { id: number; serial: string }[] = [];
    for (const s of serials) {
      const r = insert.run(s, model, date, notes);
      const id = Number(r.lastInsertRowid);
      movement(db, id, "RECEIVED", {
        date,
        notes: notes ?? `Received in stock${model ? ` (${model})` : ""}`,
      });
      added.push({ id, serial: s });
    }
    return { count: added.length, serials: added.map((a) => a.serial) };
  })();
}

// ---------------------------------------------------------------------------
// Issue to a team
// ---------------------------------------------------------------------------

export function issueRouters(
  db: DB,
  input: { teamId: number; serials: string[]; date: string; notes?: string | null }
): { issued: string[] } {
  return db.transaction(() => {
    const team = db.prepare("SELECT name, active FROM teams WHERE id = ?").get(input.teamId) as
      | { name: string; active: number }
      | undefined;
    if (!team) throw new AppError(`Team #${input.teamId} not found.`);
    if (!team.active) throw new AppError(`${team.name} is deactivated. Activate it in Settings first.`);

    const serials = input.serials.map((s) => s.trim()).filter(Boolean);
    if (serials.length === 0) throw new AppError("Enter at least one serial number.");

    const seen = new Set<string>();
    for (const s of serials) {
      if (seen.has(s)) throw new AppError(`Duplicate serial in your input: ${s}.`);
      seen.add(s);
    }

    const notes = (input.notes ?? "").trim() || null;
    for (const s of serials) {
      const r = db.prepare("SELECT * FROM routers WHERE serial_number = ?").get(s) as
        | Router
        | undefined;
      if (!r) throw new AppError(`${s} is not in inventory — add it in Receive Stock first.`);
      if (r.status !== "IN_STOCK") {
        throw new AppError(`${s} is ${describeStatus(db, r)}.`);
      }
      db.prepare("UPDATE routers SET status = 'ISSUED', current_team_id = ? WHERE id = ?").run(
        input.teamId,
        r.id
      );
      movement(db, r.id, "ISSUED", {
        teamId: input.teamId,
        date: input.date,
        notes: notes ?? `Issued to ${team.name}`,
      });
    }
    return { issued: serials };
  })();
}

// ---------------------------------------------------------------------------
// Daily close-out
// ---------------------------------------------------------------------------

export type RouterReturnOutcome = "INSTALLED" | "RETURNED" | "FAULTY" | "KEPT";

export interface RouterCloseoutItem {
  routerId: number;
  outcome: RouterReturnOutcome;
  customerId?: string | null;
}

/**
 * Outcome for each router a team currently holds:
 * INSTALLED (needs customer ID), RETURNED unused (back to IN_STOCK), FAULTY,
 * or still with team (KEPT).
 */
export function closeOutRouters(
  db: DB,
  input: { teamId: number; date: string; items: RouterCloseoutItem[] }
): {
  installed: number;
  returned: number;
  faulty: number;
  kept: number;
} {
  return db.transaction(() => {
    const team = teamName(db, input.teamId);
    const tally = { installed: 0, returned: 0, faulty: 0, kept: 0 };

    for (const item of input.items) {
      const r = getRouter(db, item.routerId);
      if (r.status !== "ISSUED" || r.current_team_id !== input.teamId) {
        throw new AppError(
          `Router ${r.serial_number} is not held by ${team} (currently: ${describeStatus(db, r)}).`
        );
      }
      switch (item.outcome) {
        case "KEPT":
          tally.kept += 1;
          break;
        case "INSTALLED": {
          const cid = (item.customerId ?? "").trim();
          if (!cid) throw new AppError(`Customer ID is required to install ${r.serial_number}.`);
          db.prepare(
            "UPDATE routers SET status = 'INSTALLED', current_team_id = NULL, customer_id = ? WHERE id = ?"
          ).run(cid, r.id);
          movement(db, r.id, "INSTALLED", {
            teamId: input.teamId,
            customerId: cid,
            date: input.date,
            notes: `Installed by ${team} for customer ${cid}`,
          });
          tally.installed += 1;
          break;
        }
        case "RETURNED":
          db.prepare(
            "UPDATE routers SET status = 'IN_STOCK', current_team_id = NULL, customer_id = NULL WHERE id = ?"
          ).run(r.id);
          movement(db, r.id, "RETURNED", {
            teamId: input.teamId,
            date: input.date,
            notes: `Returned unused by ${team}; back in stock`,
          });
          tally.returned += 1;
          break;
        case "FAULTY":
          db.prepare(
            "UPDATE routers SET status = 'FAULTY', current_team_id = NULL WHERE id = ?"
          ).run(r.id);
          movement(db, r.id, "MARKED_FAULTY", {
            teamId: input.teamId,
            date: input.date,
            notes: `Marked faulty by ${team}`,
          });
          tally.faulty += 1;
          break;
        default:
          throw new AppError(`Invalid router outcome "${item.outcome}".`);
      }
    }
    return tally;
  })();
}

// ---------------------------------------------------------------------------
// Corrections / return to supplier
// ---------------------------------------------------------------------------

export interface AdjustRouterInput {
  routerId: number;
  reason: string;
  newStatus?: RouterStatus;
  newModel?: string;
  customerId?: string | null;
  date?: string;
}

export function adjustRouter(db: DB, input: AdjustRouterInput): void {
  db.transaction(() => {
    const r = getRouter(db, input.routerId);
    const reason = (input.reason ?? "").trim();
    if (!reason) throw new AppError("A reason is required for a correction.");

    const changes: string[] = [];
    if (input.newModel !== undefined) {
      const model = input.newModel.trim() || null;
      db.prepare("UPDATE routers SET model = ? WHERE id = ?").run(model, r.id);
      changes.push(`model ${r.model ?? "—"} → ${model ?? "—"}`);
    }
    if (input.customerId !== undefined) {
      const cid = (input.customerId ?? "").trim() || null;
      db.prepare("UPDATE routers SET customer_id = ? WHERE id = ?").run(cid, r.id);
      changes.push(`customer ${r.customer_id ?? "—"} → ${cid ?? "—"}`);
    }
    if (input.newStatus && input.newStatus !== r.status) {
      const allowed: RouterStatus[] = [
        "IN_STOCK",
        "ISSUED",
        "INSTALLED",
        "FAULTY",
        "RETURNED_TO_SUPPLIER",
      ];
      if (!allowed.includes(input.newStatus)) throw new AppError(`Invalid status "${input.newStatus}".`);
      if (input.newStatus === "INSTALLED") {
        const cid = (input.customerId ?? r.customer_id ?? "").trim();
        if (!cid) throw new AppError("A customer ID is required to set a router as INSTALLED.");
        db.prepare("UPDATE routers SET customer_id = ? WHERE id = ?").run(cid, r.id);
      }
      if (input.newStatus === "IN_STOCK") {
        db.prepare(
          "UPDATE routers SET current_team_id = NULL, customer_id = NULL WHERE id = ?"
        ).run(r.id);
      }
      if (input.newStatus !== "ISSUED") {
        db.prepare("UPDATE routers SET current_team_id = NULL WHERE id = ?").run(r.id);
      }
      db.prepare("UPDATE routers SET status = ? WHERE id = ?").run(input.newStatus, r.id);
      changes.push(`status ${r.status} → ${input.newStatus}`);
    }
    if (changes.length === 0) throw new AppError("Nothing to change — edit at least one field.");

    movement(db, r.id, "CORRECTION", {
      teamId: r.current_team_id,
      customerId: r.customer_id,
      date: input.date ?? todayStr(),
      notes: `${changes.join("; ")} — reason: ${reason}`,
    });
  })();
}

/** Convenience: send a faulty/unused router back to the supplier. */
export function returnRouterToSupplier(
  db: DB,
  input: { routerId: number; reason: string; date?: string }
): void {
  db.transaction(() => {
    const r = getRouter(db, input.routerId);
    const reason = (input.reason ?? "").trim();
    if (!reason) throw new AppError("A reason is required.");
    db.prepare(
      "UPDATE routers SET status = 'RETURNED_TO_SUPPLIER', current_team_id = NULL WHERE id = ?"
    ).run(r.id);
    movement(db, r.id, "CORRECTION", {
      date: input.date ?? todayStr(),
      notes: `Returned to supplier — reason: ${reason}`,
    });
  })();
}
