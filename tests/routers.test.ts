import { describe, it, expect, beforeEach } from "vitest";
import { openMemoryDatabase, type DB } from "../src/lib/db";
import {
  addRoutersBulk,
  previewBulkRouters,
  issueRouters,
  closeOutRouters,
  adjustRouter,
  returnRouterToSupplier,
  parseSerials,
} from "../src/lib/routers";
import { AppError } from "../src/lib/types";

let db: DB;
let teamId: number;
let team2Id: number;

beforeEach(() => {
  db = openMemoryDatabase();
  teamId = Number(
    db.prepare("INSERT INTO teams (name, active, created_at) VALUES ('Team 1', 1, '2026-01-01')").run()
      .lastInsertRowid
  );
  team2Id = Number(
    db.prepare("INSERT INTO teams (name, active, created_at) VALUES ('Team 2', 1, '2026-01-01')").run()
      .lastInsertRowid
  );
});

function status(serial: string) {
  return db.prepare("SELECT status, current_team_id, customer_id FROM routers WHERE serial_number = ?").get(serial) as {
    status: string;
    current_team_id: number | null;
    customer_id: string | null;
  };
}

describe("parsing pasted serials", () => {
  it("splits on newlines, commas, semicolons and spaces", () => {
    expect(parseSerials("A1, A2; A3\nA4  A5")).toEqual(["A1", "A2", "A3", "A4", "A5"]);
  });
});

describe("bulk router receive & duplicate handling", () => {
  it("adds routers and logs RECEIVED movements", () => {
    const r = addRoutersBulk(db, { serials: ["SN1", "SN2", "SN3"], model: "Nokia" });
    expect(r.count).toBe(3);
    const count = db.prepare("SELECT COUNT(*) AS n FROM routers").get() as { n: number };
    expect(count.n).toBe(3);
    const moves = db.prepare("SELECT COUNT(*) AS n FROM router_movements WHERE type = 'RECEIVED'").get() as {
      n: number;
    };
    expect(moves.n).toBe(3);
  });

  it("flags duplicates in the input before saving", () => {
    const preview = previewBulkRouters(db, ["SN1", "SN2", "SN1"]);
    expect(preview.duplicatesInInput).toEqual(["SN1"]);
    expect(() => addRoutersBulk(db, { serials: ["SN1", "SN2", "SN1"] })).toThrow(/Duplicate serials in your input/);
    // nothing saved
    const count = db.prepare("SELECT COUNT(*) AS n FROM routers").get() as { n: number };
    expect(count.n).toBe(0);
  });

  it("rejects serials already in the system with their status", () => {
    addRoutersBulk(db, { serials: ["SN1"] });
    issueRouters(db, { teamId, serials: ["SN1"], date: "2026-01-02" });
    const preview = previewBulkRouters(db, ["SN1", "SN2"]);
    expect(preview.alreadyInSystem).toEqual([{ serial: "SN1", status: "ISSUED" }]);
    expect(() => addRoutersBulk(db, { serials: ["SN1", "SN2"] })).toThrow(/SN1 \(ISSUED\)/);
  });

  it("requires at least one serial", () => {
    expect(() => addRoutersBulk(db, { serials: [" "] })).toThrow(/at least one/);
  });
});

describe("issuing routers", () => {
  beforeEach(() => {
    addRoutersBulk(db, { serials: ["SN1", "SN2", "SN3"] });
  });

  it("issues IN_STOCK routers to a team", () => {
    issueRouters(db, { teamId, serials: ["SN1", "SN2"], date: "2026-01-02" });
    expect(status("SN1")).toEqual({ status: "ISSUED", current_team_id: teamId, customer_id: null });
  });

  it("clear error when serial not in inventory", () => {
    expect(() => issueRouters(db, { teamId, serials: ["NOPE"], date: "2026-01-02" })).toThrow(
      /NOPE is not in inventory/
    );
  });

  it("clear error when already issued to a team", () => {
    issueRouters(db, { teamId, serials: ["SN1"], date: "2026-01-02" });
    expect(() => issueRouters(db, { teamId: team2Id, serials: ["SN1"], date: "2026-01-03" })).toThrow(
      /SN1 is already issued to Team 1/
    );
  });

  it("rejects duplicate serials in one issue batch", () => {
    expect(() => issueRouters(db, { teamId, serials: ["SN1", "SN1"], date: "2026-01-02" })).toThrow(/Duplicate/);
  });

  it("a failed batch issues nothing (atomic)", () => {
    expect(() =>
      issueRouters(db, { teamId, serials: ["SN1", "SN2", "NOPE"], date: "2026-01-02" })
    ).toThrow(AppError);
    expect(status("SN1").status).toBe("IN_STOCK");
    expect(status("SN2").status).toBe("IN_STOCK");
  });
});

describe("close-out status transitions", () => {
  beforeEach(() => {
    addRoutersBulk(db, { serials: ["SN1", "SN2", "SN3", "SN4"] });
    issueRouters(db, { teamId, serials: ["SN1", "SN2", "SN3", "SN4"], date: "2026-01-02" });
  });

  it("INSTALLED requires a customer ID and clears the team", () => {
    expect(() =>
      closeOutRouters(db, {
        teamId,
        date: "2026-01-03",
        items: [{ routerId: id("SN1"), outcome: "INSTALLED" }],
      })
    ).toThrow(/Customer ID is required/);
    const tally = closeOutRouters(db, {
      teamId,
      date: "2026-01-03",
      items: [{ routerId: id("SN1"), outcome: "INSTALLED", customerId: "CUST-9" }],
    });
    expect(tally.installed).toBe(1);
    expect(status("SN1")).toEqual({ status: "INSTALLED", current_team_id: null, customer_id: "CUST-9" });
  });

  it("RETURNED unused goes back to IN_STOCK", () => {
    closeOutRouters(db, { teamId, date: "2026-01-03", items: [{ routerId: id("SN2"), outcome: "RETURNED" }] });
    expect(status("SN2").status).toBe("IN_STOCK");
  });

  it("FAULTY sets FAULTY and clears the team", () => {
    closeOutRouters(db, { teamId, date: "2026-01-03", items: [{ routerId: id("SN3"), outcome: "FAULTY" }] });
    const s = status("SN3");
    expect(s.status).toBe("FAULTY");
    expect(s.current_team_id).toBeNull();
  });

  it("KEPT leaves the router with the team", () => {
    closeOutRouters(db, { teamId, date: "2026-01-03", items: [{ routerId: id("SN4"), outcome: "KEPT" }] });
    const s = status("SN4");
    expect(s.status).toBe("ISSUED");
    expect(s.current_team_id).toBe(teamId);
  });

  it("cannot close out a router that the team does not hold", () => {
    expect(() =>
      closeOutRouters(db, {
        teamId: team2Id,
        date: "2026-01-03",
        items: [{ routerId: id("SN1"), outcome: "RETURNED" }],
      })
    ).toThrow(/not held by Team 2/);
  });

  function id(serial: string): number {
    return (db.prepare("SELECT id FROM routers WHERE serial_number = ?").get(serial) as { id: number }).id;
  }
});

describe("corrections & return to supplier", () => {
  it("corrections require a reason and are logged", () => {
    addRoutersBulk(db, { serials: ["SN1"] });
    const rid = (db.prepare("SELECT id FROM routers WHERE serial_number = 'SN1'").get() as { id: number }).id;
    expect(() => adjustRouter(db, { routerId: rid, reason: "", newStatus: "FAULTY" })).toThrow(/reason/);
    adjustRouter(db, { routerId: rid, reason: "cracked on arrival", newStatus: "FAULTY" });
    expect(status("SN1").status).toBe("FAULTY");
    const m = db.prepare("SELECT notes FROM router_movements WHERE router_id = ? AND type = 'CORRECTION'").get(rid) as {
      notes: string;
    };
    expect(m.notes).toMatch(/cracked on arrival/);
  });

  it("return to supplier sets status and logs", () => {
    addRoutersBulk(db, { serials: ["SN1"] });
    const rid = (db.prepare("SELECT id FROM routers WHERE serial_number = 'SN1'").get() as { id: number }).id;
    returnRouterToSupplier(db, { routerId: rid, reason: "RMA #123" });
    expect(status("SN1").status).toBe("RETURNED_TO_SUPPLIER");
  });

  it("INSTALLED correction requires a customer ID", () => {
    addRoutersBulk(db, { serials: ["SN1"] });
    const rid = (db.prepare("SELECT id FROM routers WHERE serial_number = 'SN1'").get() as { id: number }).id;
    expect(() => adjustRouter(db, { routerId: rid, reason: "fix", newStatus: "INSTALLED" })).toThrow(
      /customer ID/i
    );
  });
});
