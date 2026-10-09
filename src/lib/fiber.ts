// Fiber domain logic: drums, pieces, issue (with split), return (with remainder),
// scrap, corrections. Every state change writes an audit movement. All mutating
// functions run inside a database transaction so a failure never leaves partial data.

import type { DB } from "./db";
import {
  AppError,
  type FiberMovementType,
  type FiberPiece,
  type FiberStatus,
} from "./types";
import { nowIso, parseLength, roundM, todayStr } from "./dates";

const EPS = 0.0005; // 0.5 mm tolerance for float comparisons on meters

function movement(
  db: DB,
  pieceId: number,
  type: FiberMovementType,
  opts: { teamId?: number | null; lengthM?: number | null; date: string; notes?: string | null }
): void {
  db.prepare(
    `INSERT INTO fiber_movements (piece_id, type, team_id, length_m, date, notes)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(
    pieceId,
    type,
    opts.teamId ?? null,
    opts.lengthM ?? null,
    opts.date,
    opts.notes ?? null
  );
}

function getPiece(db: DB, pieceId: number): FiberPiece {
  const p = db.prepare("SELECT * FROM fiber_pieces WHERE id = ?").get(pieceId) as
    | FiberPiece
    | undefined;
  if (!p) throw new AppError(`Fiber piece #${pieceId} not found.`);
  return p;
}

function getTeamName(db: DB, teamId: number): string {
  const t = db.prepare("SELECT name FROM teams WHERE id = ?").get(teamId) as
    | { name: string }
    | undefined;
  if (!t) throw new AppError(`Team #${teamId} not found.`);
  return t.name;
}

/** Next drum code: first free "DRUM-NNN" (3+ digits). */
export function nextDrumCode(db: DB): string {
  for (let i = 1; i <= 99999; i++) {
    const code = `DRUM-${String(i).padStart(3, "0")}`;
    const row = db.prepare("SELECT 1 FROM fiber_drums WHERE code = ?").get(code);
    if (!row) return code;
  }
  throw new AppError("Could not generate a drum code.");
}

/** First free child code: parent code + n (e.g. DRUM-001-A -> DRUM-001-A1). */
export function nextChildCode(db: DB, parentCode: string): string {
  for (let n = 1; n <= 99999; n++) {
    const code = `${parentCode}${n}`;
    const row = db.prepare("SELECT 1 FROM fiber_pieces WHERE code = ?").get(code);
    if (!row) return code;
  }
  throw new AppError(`Could not generate a piece code from ${parentCode}.`);
}

// ---------------------------------------------------------------------------
// Receive a drum
// ---------------------------------------------------------------------------

export interface ReceiveDrumInput {
  code?: string;
  supplier?: string | null;
  totalLengthM: number;
  dateReceived?: string;
  notes?: string | null;
}

/**
 * Rule 1: receiving a drum creates the drum plus one IN_STOCK piece equal to
 * the full length (code "<DRUM>-A").
 */
export function receiveDrum(
  db: DB,
  input: ReceiveDrumInput
): { drumId: number; drumCode: string; pieceId: number; pieceCode: string } {
  return db.transaction(() => {
    let total: number;
    try {
      total = parseLength(input.totalLengthM, "Drum length");
    } catch (e) {
      throw new AppError((e as Error).message);
    }
    const code = (input.code ?? "").trim() || nextDrumCode(db);
    if (!code || code.length > 60) throw new AppError("Drum code must be 1–60 characters.");
    const existing = db.prepare("SELECT 1 FROM fiber_drums WHERE code = ?").get(code);
    if (existing) throw new AppError(`Drum code ${code} already exists.`);

    const date = input.dateReceived ?? todayStr();
    const r = db
      .prepare(
        `INSERT INTO fiber_drums (code, supplier, total_length_m, date_received, notes)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(
        code,
        (input.supplier ?? "").trim() || null,
        total,
        date,
        (input.notes ?? "").trim() || null
      );
    const drumId = Number(r.lastInsertRowid);

    // First piece of a drum is "<DRUM>-A" (then -B, -C … if ever needed).
    let finalPieceCode = "";
    for (const letter of "ABCDEFGHIJKLMNOPQRSTUVWXYZ") {
      const candidate = `${code}-${letter}`;
      if (!db.prepare("SELECT 1 FROM fiber_pieces WHERE code = ?").get(candidate)) {
        finalPieceCode = candidate;
        break;
      }
    }
    if (!finalPieceCode) finalPieceCode = nextChildCode(db, `${code}-A`);

    const pr = db
      .prepare(
        `INSERT INTO fiber_pieces (code, drum_id, parent_piece_id, length_m, status, current_team_id, created_at)
         VALUES (?, ?, NULL, ?, 'IN_STOCK', NULL, ?)`
      )
      .run(finalPieceCode, drumId, total, nowIso());
    const pieceId = Number(pr.lastInsertRowid);

    movement(db, pieceId, "CREATED_FROM_DRUM", {
      lengthM: total,
      date,
      notes: `Drum ${code} received${input.supplier ? ` from ${input.supplier}` : ""}`,
    });

    return { drumId, drumCode: code, pieceId, pieceCode: finalPieceCode };
  })();
}

// ---------------------------------------------------------------------------
// Issue fiber
// ---------------------------------------------------------------------------

export interface FiberIssueItem {
  pieceId: number;
  mode: "WHOLE" | "PARTIAL";
  lengthM?: number; // required for PARTIAL
}

export interface IssueFiberResult {
  issued: { pieceId: number; code: string; lengthM: number; fromCode: string | null }[];
}

/**
 * Issue fiber pieces to a team.
 * WHOLE: the piece itself goes ISSUED to the team.
 * PARTIAL: a new ISSUED piece of lengthM is created (child of the original) and
 * the original stays IN_STOCK with the remainder. A CUT movement is logged.
 */
export function issueFiber(
  db: DB,
  input: { teamId: number; date: string; notes?: string | null; items: FiberIssueItem[] }
): IssueFiberResult {
  return db.transaction(() => {
    const teamName = getTeamName(db, input.teamId);
    const team = db.prepare("SELECT active FROM teams WHERE id = ?").get(input.teamId) as {
      active: number;
    };
    if (!team.active) throw new AppError(`${teamName} is deactivated. Activate it in Settings first.`);

    const issued: IssueFiberResult["issued"] = [];
    for (const item of input.items) {
      const piece = getPiece(db, item.pieceId);
      if (piece.status !== "IN_STOCK") {
        throw new AppError(
          `Piece ${piece.code} is not in the stock pool (status: ${piece.status}).`
        );
      }
      const notes = (input.notes ?? "").trim() || null;

      if (item.mode === "WHOLE") {
        db.prepare(
          "UPDATE fiber_pieces SET status = 'ISSUED', current_team_id = ? WHERE id = ?"
        ).run(input.teamId, piece.id);
        movement(db, piece.id, "ISSUED", {
          teamId: input.teamId,
          lengthM: piece.length_m,
          date: input.date,
          notes: notes ?? `Whole piece issued to ${teamName}`,
        });
        issued.push({ pieceId: piece.id, code: piece.code, lengthM: piece.length_m, fromCode: null });
        continue;
      }

      // PARTIAL — split
      let cut: number;
      try {
        cut = parseLength(item.lengthM, "Issue length");
      } catch (e) {
        throw new AppError((e as Error).message);
      }
      if (cut > piece.length_m + EPS) {
        throw new AppError(
          `Cannot issue ${roundM(cut)} m from ${piece.code} — it only holds ${roundM(piece.length_m)} m.`
        );
      }
      if (cut >= piece.length_m - EPS) {
        // Equal to the whole piece: treat as a whole issue.
        db.prepare(
          "UPDATE fiber_pieces SET status = 'ISSUED', current_team_id = ? WHERE id = ?"
        ).run(input.teamId, piece.id);
        movement(db, piece.id, "ISSUED", {
          teamId: input.teamId,
          lengthM: piece.length_m,
          date: input.date,
          notes: notes ?? `Whole piece issued to ${teamName}`,
        });
        issued.push({ pieceId: piece.id, code: piece.code, lengthM: piece.length_m, fromCode: null });
        continue;
      }

      const remaining = roundM(piece.length_m - cut);
      const childCode = nextChildCode(db, piece.code);
      const cr = db
        .prepare(
          `INSERT INTO fiber_pieces (code, drum_id, parent_piece_id, length_m, status, current_team_id, created_at)
           VALUES (?, ?, ?, ?, 'ISSUED', ?, ?)`
        )
        .run(childCode, piece.drum_id, piece.id, cut, input.teamId, nowIso());
      const childId = Number(cr.lastInsertRowid);

      db.prepare("UPDATE fiber_pieces SET length_m = ? WHERE id = ?").run(remaining, piece.id);

      movement(db, piece.id, "CUT", {
        teamId: input.teamId,
        lengthM: cut,
        date: input.date,
        notes: `Cut ${roundM(cut)} m (${childCode}) for ${teamName}; ${remaining} m stays in pool`,
      });
      movement(db, childId, "ISSUED", {
        teamId: input.teamId,
        lengthM: cut,
        date: input.date,
        notes: notes ?? `Cut from ${piece.code} and issued to ${teamName}`,
      });

      issued.push({ pieceId: childId, code: childCode, lengthM: cut, fromCode: piece.code });
    }
    return { issued };
  })();
}

// ---------------------------------------------------------------------------
// Return fiber
// ---------------------------------------------------------------------------

export type FiberReturnOutcome = "RETURNED" | "SCRAP" | "KEPT";

export interface FiberReturnItem {
  pieceId: number;
  outcome: FiberReturnOutcome;
  remainingM?: number; // required for RETURNED and SCRAP
}

export interface ReturnFiberResult {
  consumed: { pieceId: number; code: string; usedM: number; returnedM: number }[];
  remainders: { pieceId: number; code: string; lengthM: number; scrapped: boolean }[];
}

/**
 * Record what a team brought back.
 * used = issued length − remaining (cannot be negative).
 * The issued piece always ends CONSUMED; a remainder > 0 becomes a new IN_STOCK
 * piece (parent = the consumed one) — or SCRAP if the user chose "mark as scrap".
 */
export function returnFiberItems(
  db: DB,
  input: { teamId: number; date: string; items: FiberReturnItem[] }
): ReturnFiberResult {
  return db.transaction(() => {
    const teamName = getTeamName(db, input.teamId);
    const consumed: ReturnFiberResult["consumed"] = [];
    const remainders: ReturnFiberResult["remainders"] = [];

    for (const item of input.items) {
      if (item.outcome === "KEPT") continue;
      const piece = getPiece(db, item.pieceId);
      if (piece.status !== "ISSUED" || piece.current_team_id !== input.teamId) {
        const holder =
          piece.status === "ISSUED" && piece.current_team_id
            ? getTeamName(db, piece.current_team_id)
            : piece.status;
        throw new AppError(
          `Piece ${piece.code} is not held by ${teamName} (currently: ${holder}).`
        );
      }

      let remaining: number;
      try {
        remaining =
          item.remainingM === undefined || item.remainingM === null
            ? 0
            : parseLengthOrZero(item.remainingM, "Remaining length");
      } catch (e) {
        throw new AppError((e as Error).message);
      }
      if (remaining > piece.length_m + EPS) {
        throw new AppError(
          `Remaining length for ${piece.code} (${roundM(remaining)} m) cannot exceed the issued length (${roundM(piece.length_m)} m).`
        );
      }
      remaining = roundM(Math.min(remaining, piece.length_m));
      const used = roundM(piece.length_m - remaining);

      movement(db, piece.id, "RETURNED", {
        teamId: input.teamId,
        lengthM: remaining,
        date: input.date,
        notes: `Returned by ${teamName} with ${remaining} m remaining of ${roundM(piece.length_m)} m issued; ${used} m used`,
      });
      if (used > 0) {
        movement(db, piece.id, "CONSUMED", {
          teamId: input.teamId,
          lengthM: used,
          date: input.date,
          notes: `${used} m consumed on site by ${teamName}`,
        });
      }
      db.prepare(
        "UPDATE fiber_pieces SET status = 'CONSUMED', current_team_id = NULL WHERE id = ?"
      ).run(piece.id);
      consumed.push({
        pieceId: piece.id,
        code: piece.code,
        usedM: used,
        returnedM: remaining,
      });

      if (remaining > 0) {
        const childCode = nextChildCode(db, piece.code);
        const scrapped = item.outcome === "SCRAP";
        const cr = db
          .prepare(
            `INSERT INTO fiber_pieces (code, drum_id, parent_piece_id, length_m, status, current_team_id, created_at)
             VALUES (?, ?, ?, ?, ?, NULL, ?)`
          )
          .run(
            childCode,
            piece.drum_id,
            piece.id,
            remaining,
            scrapped ? "SCRAP" : "IN_STOCK",
            nowIso()
          );
        const childId = Number(cr.lastInsertRowid);
        movement(db, childId, "RETURNED", {
          teamId: input.teamId,
          lengthM: remaining,
          date: input.date,
          notes: `Remainder of ${piece.code} returned by ${teamName}${scrapped ? "" : " and added to the stock pool"}`,
        });
        if (scrapped) {
          movement(db, childId, "MARKED_SCRAP", {
            lengthM: remaining,
            date: input.date,
            notes: `Below scrap threshold — remainder of ${piece.code} discarded on return`,
          });
        }
        remainders.push({ pieceId: childId, code: childCode, lengthM: remaining, scrapped });
      }
    }
    return { consumed, remainders };
  })();
}

function parseLengthOrZero(value: unknown, label: string): number {
  const n = typeof value === "number" ? value : parseFloat(String(value ?? ""));
  if (!Number.isFinite(n)) throw new AppError(`${label} must be a number (meters).`);
  if (n < 0) throw new AppError(`${label} cannot be negative.`);
  return n;
}

// ---------------------------------------------------------------------------
// Scrap / correct
// ---------------------------------------------------------------------------

export function markScrap(
  db: DB,
  input: { pieceId: number; reason: string; date?: string }
): void {
  db.transaction(() => {
    const piece = getPiece(db, input.pieceId);
    if (piece.status !== "IN_STOCK") {
      throw new AppError(
        `Only pool (IN_STOCK) pieces can be marked as scrap — ${piece.code} is ${piece.status}.`
      );
    }
    const reason = (input.reason ?? "").trim();
    if (!reason) throw new AppError("A reason is required to mark a piece as scrap.");
    db.prepare("UPDATE fiber_pieces SET status = 'SCRAP', current_team_id = NULL WHERE id = ?").run(
      piece.id
    );
    movement(db, piece.id, "MARKED_SCRAP", {
      lengthM: piece.length_m,
      date: input.date ?? todayStr(),
      notes: reason,
    });
  })();
}

export interface AdjustFiberInput {
  pieceId: number;
  reason: string;
  newLengthM?: number;
  newStatus?: FiberStatus;
  date?: string;
}

/** Corrections — never hard-delete. Every change is logged as CORRECTION with a reason. */
export function adjustFiber(db: DB, input: AdjustFiberInput): void {
  db.transaction(() => {
    const piece = getPiece(db, input.pieceId);
    const reason = (input.reason ?? "").trim();
    if (!reason) throw new AppError("A reason is required for a correction.");

    const changes: string[] = [];
    if (input.newLengthM !== undefined && input.newLengthM !== null) {
      let newLen: number;
      try {
        newLen = parseLength(input.newLengthM, "New length");
      } catch (e) {
        throw new AppError((e as Error).message);
      }
      db.prepare("UPDATE fiber_pieces SET length_m = ? WHERE id = ?").run(newLen, piece.id);
      changes.push(`length ${roundM(piece.length_m)} m → ${newLen} m`);
    }
    if (input.newStatus && input.newStatus !== piece.status) {
      const allowed: FiberStatus[] = ["IN_STOCK", "ISSUED", "CONSUMED", "SCRAP"];
      if (!allowed.includes(input.newStatus)) {
        throw new AppError(`Invalid status "${input.newStatus}".`);
      }
      if (input.newStatus === "ISSUED" && !piece.current_team_id) {
        throw new AppError("A piece can only be set to ISSUED if it is assigned to a team (use Daily Issue instead).");
      }
      if (input.newStatus === "IN_STOCK") {
        db.prepare("UPDATE fiber_pieces SET current_team_id = NULL WHERE id = ?").run(piece.id);
      }
      db.prepare("UPDATE fiber_pieces SET status = ? WHERE id = ?").run(input.newStatus, piece.id);
      changes.push(`status ${piece.status} → ${input.newStatus}`);
    }
    if (changes.length === 0) throw new AppError("Nothing to change — edit at least one field.");

    movement(db, piece.id, "CORRECTION", {
      teamId: piece.current_team_id,
      lengthM: piece.length_m,
      date: input.date ?? todayStr(),
      notes: `${changes.join("; ")} — reason: ${reason}`,
    });
  })();
}
