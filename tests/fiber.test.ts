import { describe, it, expect, beforeEach } from "vitest";
import { openMemoryDatabase, type DB } from "../src/lib/db";
import {
  receiveDrum,
  issueFiber,
  returnFiberItems,
  markScrap,
  adjustFiber,
  nextChildCode,
} from "../src/lib/fiber";
import { submitDailyReturn } from "../src/lib/daily";
import { AppError } from "../src/lib/types";

let db: DB;
let teamId: number;

beforeEach(() => {
  db = openMemoryDatabase();
  teamId = Number(
    db.prepare("INSERT INTO teams (name, active, created_at) VALUES ('Team 1', 1, '2026-01-01')").run()
      .lastInsertRowid
  );
});

function movements(pieceId: number) {
  return db
    .prepare("SELECT * FROM fiber_movements WHERE piece_id = ? ORDER BY id")
    .all(pieceId) as { type: string; length_m: number | null; notes: string | null }[];
}

describe("receiving a drum", () => {
  it("creates the drum and one IN_STOCK piece equal to the full length", () => {
    const r = receiveDrum(db, { code: "DRUM-001", totalLengthM: 2000, dateReceived: "2026-01-01" });
    expect(r.drumCode).toBe("DRUM-001");
    expect(r.pieceCode).toBe("DRUM-001-A");
    const piece = db.prepare("SELECT * FROM fiber_pieces WHERE id = ?").get(r.pieceId) as {
      length_m: number;
      status: string;
    };
    expect(piece.length_m).toBe(2000);
    expect(piece.status).toBe("IN_STOCK");
    expect(movements(r.pieceId)[0].type).toBe("CREATED_FROM_DRUM");
  });

  it("rejects non-positive lengths and duplicate drum codes", () => {
    expect(() => receiveDrum(db, { totalLengthM: 0 })).toThrow(AppError);
    receiveDrum(db, { code: "DRUM-001", totalLengthM: 100 });
    expect(() => receiveDrum(db, { code: "DRUM-001", totalLengthM: 100 })).toThrow(/already exists/);
  });

  it("generates the first free drum code", () => {
    const r1 = receiveDrum(db, { totalLengthM: 100 });
    const r2 = receiveDrum(db, { totalLengthM: 100 });
    expect(r1.drumCode).toBe("DRUM-001");
    expect(r2.drumCode).toBe("DRUM-002");
  });
});

describe("fiber split on partial issue", () => {
  it("issues 100 m from a 150 m piece: new ISSUED piece of 100 m, original stays IN_STOCK at 50 m", () => {
    const drum = receiveDrum(db, { totalLengthM: 150 });
    const result = issueFiber(db, {
      teamId,
      date: "2026-01-02",
      items: [{ pieceId: drum.pieceId, mode: "PARTIAL", lengthM: 100 }],
    });
    expect(result.issued).toHaveLength(1);
    const childCode = result.issued[0].code;

    const parent = db.prepare("SELECT * FROM fiber_pieces WHERE id = ?").get(drum.pieceId) as {
      length_m: number;
      status: string;
      current_team_id: number | null;
    };
    expect(parent.length_m).toBe(50);
    expect(parent.status).toBe("IN_STOCK");
    expect(parent.current_team_id).toBeNull();

    const child = db
      .prepare("SELECT * FROM fiber_pieces WHERE code = ?")
      .get(childCode) as {
      id: number;
      length_m: number;
      status: string;
      current_team_id: number;
      parent_piece_id: number;
    };
    expect(child.length_m).toBe(100);
    expect(child.status).toBe("ISSUED");
    expect(child.current_team_id).toBe(teamId);
    expect(child.parent_piece_id).toBe(drum.pieceId);

    // CUT logged on the parent, ISSUED on the child.
    expect(movements(drum.pieceId).map((m) => m.type)).toContain("CUT");
    expect(movements(child.id).map((m) => m.type)).toContain("ISSUED");
  });

  it("treats a cut equal to the whole piece as a whole issue", () => {
    const drum = receiveDrum(db, { totalLengthM: 100 });
    issueFiber(db, {
      teamId,
      date: "2026-01-02",
      items: [{ pieceId: drum.pieceId, mode: "PARTIAL", lengthM: 100 }],
    });
    const parent = db.prepare("SELECT * FROM fiber_pieces WHERE id = ?").get(drum.pieceId) as {
      status: string;
      length_m: number;
    };
    expect(parent.status).toBe("ISSUED");
    expect(parent.length_m).toBe(100);
  });

  it("validates: length must be > 0 and <= piece length", () => {
    const drum = receiveDrum(db, { totalLengthM: 150 });
    expect(() =>
      issueFiber(db, { teamId, date: "2026-01-02", items: [{ pieceId: drum.pieceId, mode: "PARTIAL", lengthM: 200 }] })
    ).toThrow(/only holds/);
    expect(() =>
      issueFiber(db, { teamId, date: "2026-01-02", items: [{ pieceId: drum.pieceId, mode: "PARTIAL", lengthM: -5 }] })
    ).toThrow(AppError);
    expect(() =>
      issueFiber(db, { teamId, date: "2026-01-02", items: [{ pieceId: drum.pieceId, mode: "PARTIAL", lengthM: 0 }] })
    ).toThrow(AppError);
  });

  it("refuses to issue a piece that is not IN_STOCK (no double-issuing)", () => {
    const drum = receiveDrum(db, { totalLengthM: 100 });
    issueFiber(db, { teamId, date: "2026-01-02", items: [{ pieceId: drum.pieceId, mode: "WHOLE" }] });
    expect(() =>
      issueFiber(db, { teamId, date: "2026-01-03", items: [{ pieceId: drum.pieceId, mode: "WHOLE" }] })
    ).toThrow(/not in the stock pool/);
  });

  it("generates unique child codes (A1, A2, …)", () => {
    const drum = receiveDrum(db, { totalLengthM: 300 });
    expect(nextChildCode(db, "DRUM-001-A")).toBe("DRUM-001-A1");
    issueFiber(db, {
      teamId,
      date: "2026-01-02",
      items: [{ pieceId: drum.pieceId, mode: "PARTIAL", lengthM: 100 }],
    });
    expect(nextChildCode(db, "DRUM-001-A")).toBe("DRUM-001-A2");
  });
});

describe("returning fiber", () => {
  function issue150(): { parent: number; child: number } {
    const drum = receiveDrum(db, { totalLengthM: 150 });
    const r = issueFiber(db, {
      teamId,
      date: "2026-01-02",
      items: [{ pieceId: drum.pieceId, mode: "PARTIAL", lengthM: 150 - 0 }], // whole 150 via partial==whole path
    });
    return { parent: drum.pieceId, child: r.issued[0].pieceId };
  }

  it("remaining 40 m of a 200 m piece: used 160 m, original CONSUMED, new IN_STOCK piece with parent link", () => {
    const drum = receiveDrum(db, { totalLengthM: 200 });
    const issued = issueFiber(db, {
      teamId,
      date: "2026-01-02",
      items: [{ pieceId: drum.pieceId, mode: "WHOLE" }],
    });
    const pieceId = issued.issued[0].pieceId;

    const result = returnFiberItems(db, {
      teamId,
      date: "2026-01-03",
      items: [{ pieceId, outcome: "RETURNED", remainingM: 40 }],
    });

    expect(result.consumed[0].usedM).toBe(160);
    expect(result.consumed[0].returnedM).toBe(40);
    expect(result.remainders).toHaveLength(1);
    expect(result.remainders[0].lengthM).toBe(40);
    expect(result.remainders[0].scrapped).toBe(false);

    const original = db.prepare("SELECT * FROM fiber_pieces WHERE id = ?").get(pieceId) as {
      status: string;
      current_team_id: number | null;
    };
    expect(original.status).toBe("CONSUMED");
    expect(original.current_team_id).toBeNull();

    const remainder = db
      .prepare("SELECT * FROM fiber_pieces WHERE id = ?")
      .get(result.remainders[0].pieceId) as {
      status: string;
      length_m: number;
      parent_piece_id: number;
    };
    expect(remainder.status).toBe("IN_STOCK");
    expect(remainder.length_m).toBe(40);
    expect(remainder.parent_piece_id).toBe(pieceId);

    const types = movements(pieceId).map((m) => m.type);
    expect(types).toContain("RETURNED");
    expect(types).toContain("CONSUMED");
  });

  it("remaining 0: piece becomes CONSUMED, no new piece", () => {
    const drum = receiveDrum(db, { totalLengthM: 80 });
    const issued = issueFiber(db, {
      teamId,
      date: "2026-01-02",
      items: [{ pieceId: drum.pieceId, mode: "WHOLE" }],
    });
    const result = returnFiberItems(db, {
      teamId,
      date: "2026-01-03",
      items: [{ pieceId: issued.issued[0].pieceId, outcome: "RETURNED", remainingM: 0 }],
    });
    expect(result.consumed[0].usedM).toBe(80);
    expect(result.remainders).toHaveLength(0);
    const piece = db.prepare("SELECT status FROM fiber_pieces WHERE id = ?").get(issued.issued[0].pieceId) as {
      status: string;
    };
    expect(piece.status).toBe("CONSUMED");
  });

  it("rejects remaining > issued length and negative remaining", () => {
    const drum = receiveDrum(db, { totalLengthM: 100 });
    const issued = issueFiber(db, {
      teamId,
      date: "2026-01-02",
      items: [{ pieceId: drum.pieceId, mode: "WHOLE" }],
    });
    const id = issued.issued[0].pieceId;
    expect(() =>
      returnFiberItems(db, { teamId, date: "2026-01-03", items: [{ pieceId: id, outcome: "RETURNED", remainingM: 150 }] })
    ).toThrow(/cannot exceed/);
    expect(() =>
      returnFiberItems(db, { teamId, date: "2026-01-03", items: [{ pieceId: id, outcome: "RETURNED", remainingM: -1 }] })
    ).toThrow(/negative/);
  });

  it("cannot return a piece held by another team", () => {
    const otherTeam = Number(
      db.prepare("INSERT INTO teams (name, active, created_at) VALUES ('Team 2', 1, '2026-01-01')").run()
        .lastInsertRowid
    );
    const drum = receiveDrum(db, { totalLengthM: 100 });
    const issued = issueFiber(db, {
      teamId: otherTeam,
      date: "2026-01-02",
      items: [{ pieceId: drum.pieceId, mode: "WHOLE" }],
    });
    expect(() =>
      returnFiberItems(db, {
        teamId,
        date: "2026-01-03",
        items: [{ pieceId: issued.issued[0].pieceId, outcome: "RETURNED", remainingM: 0 }],
      })
    ).toThrow(/not held by/);
  });

  it("SCRAP outcome: remainder below threshold becomes a SCRAP piece, logged", () => {
    const drum = receiveDrum(db, { totalLengthM: 100 });
    const issued = issueFiber(db, {
      teamId,
      date: "2026-01-02",
      items: [{ pieceId: drum.pieceId, mode: "WHOLE" }],
    });
    const result = returnFiberItems(db, {
      teamId,
      date: "2026-01-03",
      items: [{ pieceId: issued.issued[0].pieceId, outcome: "SCRAP", remainingM: 5 }],
    });
    expect(result.remainders[0].scrapped).toBe(true);
    const rem = db
      .prepare("SELECT status FROM fiber_pieces WHERE id = ?")
      .get(result.remainders[0].pieceId) as { status: string };
    expect(rem.status).toBe("SCRAP");
    const types = movements(result.remainders[0].pieceId).map((m) => m.type);
    expect(types).toContain("MARKED_SCRAP");
  });

  it("KEPT items are left untouched", () => {
    const drum = receiveDrum(db, { totalLengthM: 100 });
    const issued = issueFiber(db, {
      teamId,
      date: "2026-01-02",
      items: [{ pieceId: drum.pieceId, mode: "WHOLE" }],
    });
    returnFiberItems(db, {
      teamId,
      date: "2026-01-03",
      items: [{ pieceId: issued.issued[0].pieceId, outcome: "KEPT" }],
    });
    const piece = db.prepare("SELECT status, current_team_id FROM fiber_pieces WHERE id = ?").get(
      issued.issued[0].pieceId
    ) as { status: string; current_team_id: number };
    expect(piece.status).toBe("ISSUED");
    expect(piece.current_team_id).toBe(teamId);
  });
});

describe("used-length calculation via daily return", () => {
  it("computes used = issued − remaining and writes connections + closeout", () => {
    const drum = receiveDrum(db, { totalLengthM: 200 });
    const issued = issueFiber(db, {
      teamId,
      date: "2026-01-02",
      items: [{ pieceId: drum.pieceId, mode: "WHOLE" }],
    });
    const summary = submitDailyReturn(db, {
      teamId,
      date: "2026-01-03",
      fiber: [{ pieceId: issued.issued[0].pieceId, outcome: "RETURNED", remainingM: 40 }],
      routers: [],
      connections: 2,
    });
    expect(summary.cable).toEqual({ issuedM: 200, usedM: 160, returnedM: 40 });
    const conn = db.prepare("SELECT connections FROM daily_connections WHERE team_id = ?").get(teamId) as {
      connections: number;
    };
    expect(conn.connections).toBe(2);
    const closed = db.prepare("SELECT 1 FROM daily_closeouts WHERE team_id = ?").get(teamId);
    expect(closed).toBeTruthy();
  });

  it("rejects fractional or negative connections", () => {
    expect(() =>
      submitDailyReturn(db, { teamId, date: "2026-01-03", fiber: [], routers: [], connections: -1 })
    ).toThrow(AppError);
    expect(() =>
      submitDailyReturn(db, { teamId, date: "2026-01-03", fiber: [], routers: [], connections: 1.5 })
    ).toThrow(AppError);
  });
});

describe("scrap & corrections (never hard-delete)", () => {
  it("markScrap requires a reason and only works on pool pieces", () => {
    const drum = receiveDrum(db, { totalLengthM: 100 });
    expect(() => markScrap(db, { pieceId: drum.pieceId, reason: "" })).toThrow(/reason/);
    markScrap(db, { pieceId: drum.pieceId, reason: "Damaged during storage" });
    const piece = db.prepare("SELECT status FROM fiber_pieces WHERE id = ?").get(drum.pieceId) as {
      status: string;
    };
    expect(piece.status).toBe("SCRAP");
    expect(() => markScrap(db, { pieceId: drum.pieceId, reason: "again" })).toThrow(/IN_STOCK/);
  });

  it("corrections require a reason and are logged as CORRECTION", () => {
    const drum = receiveDrum(db, { totalLengthM: 100 });
    expect(() => adjustFiber(db, { pieceId: drum.pieceId, newLengthM: 90, reason: "" })).toThrow(/reason/);
    adjustFiber(db, { pieceId: drum.pieceId, newLengthM: 90, reason: "meter misread" });
    const piece = db.prepare("SELECT length_m FROM fiber_pieces WHERE id = ?").get(drum.pieceId) as {
      length_m: number;
    };
    expect(piece.length_m).toBe(90);
    const m = movements(drum.pieceId).find((x) => x.type === "CORRECTION");
    expect(m?.notes).toMatch(/meter misread/);
  });
});

describe("atomicity", () => {
  it("a failed multi-item issue saves nothing", () => {
    const drum = receiveDrum(db, { totalLengthM: 100 });
    const other = receiveDrum(db, { totalLengthM: 100 });
    // Second piece is bogus (id 9999) → whole transaction must roll back.
    expect(() =>
      issueFiber(db, {
        teamId,
        date: "2026-01-02",
        items: [
          { pieceId: drum.pieceId, mode: "PARTIAL", lengthM: 40 },
          { pieceId: 9999, mode: "WHOLE" },
        ],
      })
    ).toThrow(AppError);
    const parent = db.prepare("SELECT length_m, status FROM fiber_pieces WHERE id = ?").get(drum.pieceId) as {
      length_m: number;
      status: string;
    };
    expect(parent.length_m).toBe(100);
    expect(parent.status).toBe("IN_STOCK");
    const kids = db.prepare("SELECT COUNT(*) AS n FROM fiber_pieces WHERE parent_piece_id = ?").get(drum.pieceId) as {
      n: number;
    };
    expect(kids.n).toBe(0);
    // untouched drum is fine
    expect(other.pieceId).toBeTruthy();
  });
});
