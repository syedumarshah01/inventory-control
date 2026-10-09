import { describe, it, expect, beforeEach } from "vitest";
import { openMemoryDatabase, type DB } from "../src/lib/db";
import { receiveDrum, issueFiber, returnFiberItems } from "../src/lib/fiber";
import { addRoutersBulk, issueRouters, closeOutRouters } from "../src/lib/routers";
import { submitDailyIssue, submitDailyReturn } from "../src/lib/daily";
import { getTeamHoldings } from "../src/lib/reports";

let db: DB;
let t1: number;
let t2: number;

beforeEach(() => {
  db = openMemoryDatabase();
  t1 = Number(
    db.prepare("INSERT INTO teams (name, active, created_at) VALUES ('Team 1', 1, '2026-01-01')").run()
      .lastInsertRowid
  );
  t2 = Number(
    db.prepare("INSERT INTO teams (name, active, created_at) VALUES ('Team 2', 1, '2026-01-01')").run()
      .lastInsertRowid
  );
});

describe("acceptance flow: drum → issue 200 m → return 40 m → reuse 40 m piece", () => {
  it("runs end to end", () => {
    // 1. Receive a drum.
    const drum = receiveDrum(db, { code: "DRUM-001", totalLengthM: 2000, dateReceived: "2026-01-01" });

    // 2. Issue 200 m to Team 1.
    const issue1 = submitDailyIssue(db, {
      teamId: t1,
      date: "2026-01-02",
      fiber: [{ pieceId: drum.pieceId, mode: "PARTIAL", lengthM: 200 }],
      routerSerials: [],
    });
    expect(issue1.fiber.issued[0].lengthM).toBe(200);
    const held1 = getTeamHoldings(db, t1);
    expect(held1.fiber).toHaveLength(1);
    expect((held1.fiber[0] as { length_m: number }).length_m).toBe(200);

    // 3. Return 40 m the next day.
    const summary = submitDailyReturn(db, {
      teamId: t1,
      date: "2026-01-03",
      fiber: [{ pieceId: issue1.fiber.issued[0].pieceId, outcome: "RETURNED", remainingM: 40 }],
      routers: [],
      connections: 1,
    });
    expect(summary.cable.usedM).toBe(160);
    expect(summary.cable.returnedM).toBe(40);
    expect(summary.remainders).toHaveLength(1);
    const rem = summary.remainders[0];
    expect(rem.lengthM).toBe(40);
    expect(rem.scrapped).toBe(false);

    // 4. Issue that 40 m piece to Team 2 "the next day".
    const remId = db.prepare("SELECT id FROM fiber_pieces WHERE code = ?").get(rem.code) as { id: number };
    submitDailyIssue(db, {
      teamId: t2,
      date: "2026-01-04",
      fiber: [{ pieceId: remId.id, mode: "WHOLE" }],
      routerSerials: [],
    });
    const held2 = getTeamHoldings(db, t2);
    expect(held2.fiber).toHaveLength(1);
    expect((held2.fiber[0] as { code: string }).code).toBe(rem.code);

    // The pool still holds the 1800 m remainder of the drum's first piece.
    const stock = db
      .prepare("SELECT SUM(length_m) AS m FROM fiber_pieces WHERE status = 'IN_STOCK'")
      .get() as { m: number };
    expect(stock.m).toBe(1800);

    // Team 1's day is closed out and credited with the used cable.
    const conn = db.prepare("SELECT connections FROM daily_connections WHERE team_id = ?").get(t1) as {
      connections: number;
    };
    expect(conn.connections).toBe(1);
    const used = db
      .prepare(
        `SELECT SUM(length_m) AS m FROM fiber_movements
         WHERE type = 'CONSUMED' AND team_id = ? AND date = '2026-01-03'`
      )
      .get(t1) as { m: number };
    expect(used.m).toBe(160);
  });
});

describe("acceptance flow: routers issue and close out", () => {
  it("issues routers and closes them out with mixed outcomes", () => {
    addRoutersBulk(db, { serials: ["SN1", "SN2", "SN3"], model: "Nokia" });
    submitDailyIssue(db, {
      teamId: t1,
      date: "2026-01-02",
      fiber: [],
      routerSerials: ["SN1", "SN2", "SN3"],
    });
    const summary = submitDailyReturn(db, {
      teamId: t1,
      date: "2026-01-02",
      fiber: [],
      routers: [
        { routerId: rid("SN1"), outcome: "INSTALLED", customerId: "C-1" },
        { routerId: rid("SN2"), outcome: "RETURNED" },
        { routerId: rid("SN3"), outcome: "KEPT" },
      ],
    });
    expect(summary.routers).toEqual({ issued: 2, installed: 1, returned: 1, faulty: 0, kept: 1 });

    const s1 = st("SN1");
    const s2 = st("SN2");
    const s3 = st("SN3");
    expect(s1.status).toBe("INSTALLED");
    expect(s1.customer_id).toBe("C-1");
    expect(s2.status).toBe("IN_STOCK");
    expect(s3.status).toBe("ISSUED");

    // Double-issuing an installed router is refused.
    expect(() =>
      submitDailyIssue(db, { teamId: t2, date: "2026-01-03", fiber: [], routerSerials: ["SN1"] })
    ).toThrow(/already installed/);

    function rid(serial: string): number {
      return (db.prepare("SELECT id FROM routers WHERE serial_number = ?").get(serial) as { id: number }).id;
    }
    function st(serial: string) {
      return db.prepare("SELECT status, customer_id FROM routers WHERE serial_number = ?").get(serial) as {
        status: string;
        customer_id: string | null;
      };
    }
  });
});

describe("atomic daily issue (fiber + routers together)", () => {
  it("rolls back fiber when a router serial is bad", () => {
    const drum = receiveDrum(db, { totalLengthM: 500 });
    addRoutersBulk(db, { serials: ["SN1"] });
    expect(() =>
      submitDailyIssue(db, {
        teamId: t1,
        date: "2026-01-02",
        fiber: [{ pieceId: drum.pieceId, mode: "PARTIAL", lengthM: 100 }],
        routerSerials: ["SN1", "BAD-SN"],
      })
    ).toThrow(/BAD-SN is not in inventory/);
    const piece = db.prepare("SELECT length_m, status FROM fiber_pieces WHERE id = ?").get(drum.pieceId) as {
      length_m: number;
      status: string;
    };
    expect(piece).toEqual({ length_m: 500, status: "IN_STOCK" });
    const router = db.prepare("SELECT status FROM routers WHERE serial_number = 'SN1'").get() as {
      status: string;
    };
    expect(router.status).toBe("IN_STOCK");
  });
});
