/**
 * Seed script — realistic sample data:
 * 3 teams, 2 drums, ~20 routers, issue/return history, a scrapped remainder.
 *
 *   npm run db:seed
 *
 * Refuses to run on a database that already has teams (use npm run db:reset).
 */
import { openDatabase, dbPath } from "../src/lib/db";
import { receiveDrum, issueFiber, returnFiberItems, adjustFiber } from "../src/lib/fiber";
import { addRoutersBulk, issueRouters, closeOutRouters } from "../src/lib/routers";
import { addDays, todayStr } from "../src/lib/dates";

function main() {
  const db = openDatabase();
  const existing = db.prepare("SELECT COUNT(*) AS n FROM teams").get() as { n: number };
  if (existing.n > 0) {
    console.error("Database already has data. Run `npm run db:reset` to wipe and reseed.");
    process.exit(1);
  }

  const day = (n: number) => addDays(todayStr(), n);

  // ---- Teams ----
  const insertTeam = db.prepare("INSERT INTO teams (name, active, created_at) VALUES (?, 1, ?)");
  const t1 = Number(insertTeam.run("Team 1", new Date().toISOString()).lastInsertRowid);
  const t2 = Number(insertTeam.run("Team 2", new Date().toISOString()).lastInsertRowid);
  const t3 = Number(insertTeam.run("Team 3", new Date().toISOString()).lastInsertRowid);

  // ---- Drums + fiber story ----
  const drum1 = receiveDrum(db, {
    code: "DRUM-001",
    supplier: "FiberWorks Ltd",
    totalLengthM: 2000,
    dateReceived: day(-10),
    notes: "48-core armoured, first drum",
  });
  const drum2 = receiveDrum(db, {
    code: "DRUM-002",
    supplier: "FiberWorks Ltd",
    totalLengthM: 2000,
    dateReceived: day(-9),
    notes: "Second drum of the month",
  });

  // Day -10: Team 1 takes 200 m cut from DRUM-001-A.
  const issue1 = issueFiber(db, {
    teamId: t1,
    date: day(-10),
    notes: "New connection, Street 4",
    items: [{ pieceId: drum1.pieceId, mode: "PARTIAL", lengthM: 200 }],
  });
  const piece200 = issue1.issued[0].pieceId;

  // Day -9: Team 1 returns the 200 m piece with 40 m left → 160 m used, 40 m back in pool.
  returnFiberItems(db, {
    teamId: t1,
    date: day(-9),
    items: [{ pieceId: piece200, outcome: "RETURNED", remainingM: 40 }],
  });
  const pool40 = db
    .prepare("SELECT id FROM fiber_pieces WHERE parent_piece_id = ?")
    .get(piece200) as { id: number };

  // Day -8: leftover 40 m goes to Team 2 before opening anything new.
  issueFiber(db, {
    teamId: t2,
    date: day(-8),
    notes: "Small piece first — short run",
    items: [{ pieceId: pool40.id, mode: "WHOLE" }],
  });

  // Day -5: Team 3 gets 500 m from DRUM-002-A.
  const issue2 = issueFiber(db, {
    teamId: t3,
    date: day(-5),
    items: [{ pieceId: drum2.pieceId, mode: "PARTIAL", lengthM: 500 }],
  });
  // Day -4: all 500 m consumed, nothing came back.
  returnFiberItems(db, {
    teamId: t3,
    date: day(-4),
    items: [{ pieceId: issue2.issued[0].pieceId, outcome: "RETURNED", remainingM: 0 }],
  });

  // Day -3: Team 2 gets 150 m from DRUM-001-A; day -2 they return 30 m.
  const issue3 = issueFiber(db, {
    teamId: t2,
    date: day(-3),
    items: [{ pieceId: drum1.pieceId, mode: "PARTIAL", lengthM: 150 }],
  });
  returnFiberItems(db, {
    teamId: t2,
    date: day(-2),
    items: [{ pieceId: issue3.issued[0].pieceId, outcome: "RETURNED", remainingM: 30 }],
  });
  const pool30 = db
    .prepare("SELECT id FROM fiber_pieces WHERE parent_piece_id = ?")
    .get(issue3.issued[0].pieceId) as { id: number };

  // Day -2: correction example — meter marking misread (logged, never deleted).
  adjustFiber(db, {
    pieceId: pool30.id,
    newLengthM: 32,
    reason: "Meter marking misread at return — measured twice, 32 m is correct",
    date: day(-2),
  });

  // Day -1: Team 1 gets 100 m from DRUM-002-A and returns 5 m → below threshold, scrapped.
  const issue4 = issueFiber(db, {
    teamId: t1,
    date: day(-1),
    items: [{ pieceId: drum2.pieceId, mode: "PARTIAL", lengthM: 100 }],
  });
  returnFiberItems(db, {
    teamId: t1,
    date: day(-1),
    items: [{ pieceId: issue4.issued[0].pieceId, outcome: "SCRAP", remainingM: 5 }],
  });

  // ---- Routers: 20 serials, a realistic mix of outcomes ----
  const serials = Array.from({ length: 20 }, (_, i) => `SN-${String(1001 + i)}`);
  addRoutersBulk(db, {
    serials,
    model: "Nokia G-2426G-A",
    dateReceived: day(-10),
  });
  // Team 1: 5 routers day -10 → 2 installed, 1 returned, 1 faulty, 1 kept overnight.
  issueRouters(db, { teamId: t1, serials: serials.slice(0, 5), date: day(-10) });
  closeOutRouters(db, {
    teamId: t1,
    date: day(-10),
    items: [
      { routerId: bySerial(db, serials[0]), outcome: "INSTALLED", customerId: "CUST-0001" },
      { routerId: bySerial(db, serials[1]), outcome: "INSTALLED", customerId: "CUST-0002" },
      { routerId: bySerial(db, serials[2]), outcome: "RETURNED" },
      { routerId: bySerial(db, serials[3]), outcome: "FAULTY" },
      { routerId: bySerial(db, serials[4]), outcome: "KEPT" },
    ],
  });
  saveConnections(db, t1, day(-10), 2);

  // Team 2: 5 routers day -8 → 3 installed, 1 returned, 1 kept.
  issueRouters(db, { teamId: t2, serials: serials.slice(5, 10), date: day(-8) });
  closeOutRouters(db, {
    teamId: t2,
    date: day(-8),
    items: [
      { routerId: bySerial(db, serials[5]), outcome: "INSTALLED", customerId: "CUST-0003" },
      { routerId: bySerial(db, serials[6]), outcome: "INSTALLED", customerId: "CUST-0004" },
      { routerId: bySerial(db, serials[7]), outcome: "INSTALLED", customerId: "CUST-0005" },
      { routerId: bySerial(db, serials[8]), outcome: "KEPT" },
      { routerId: bySerial(db, serials[9]), outcome: "RETURNED" },
    ],
  });
  saveConnections(db, t2, day(-8), 3);

  // Team 3: 3 routers day -5 → 1 installed, 2 kept.
  issueRouters(db, { teamId: t3, serials: serials.slice(10, 13), date: day(-5) });
  closeOutRouters(db, {
    teamId: t3,
    date: day(-5),
    items: [
      { routerId: bySerial(db, serials[10]), outcome: "INSTALLED", customerId: "CUST-0006" },
      { routerId: bySerial(db, serials[11]), outcome: "KEPT" },
      { routerId: bySerial(db, serials[12]), outcome: "KEPT" },
    ],
  });
  saveConnections(db, t3, day(-5), 1);

  // Close out yesterday for the teams that still hold things.
  const closeout = db.prepare(
    "INSERT OR REPLACE INTO daily_closeouts (team_id, date, closed_at) VALUES (?, ?, ?)"
  );
  closeout.run(t1, day(-1), new Date().toISOString());

  console.log(`Seeded database at ${dbPath()}`);
  console.log(`  Teams: 3 (Team 1, Team 2, Team 3)`);
  console.log(`  Drums: 2 (${drum1.drumCode} 2000 m, ${drum2.drumCode} 2000 m)`);
  console.log(`  Routers: 20 (SN-1001 … SN-1020)`);
  console.log(`  Fiber history: issue/return/scrap examples including 32 m correction`);
  db.close();
}

function bySerial(db: ReturnType<typeof openDatabase>, serial: string): number {
  const r = db.prepare("SELECT id FROM routers WHERE serial_number = ?").get(serial) as
    | { id: number }
    | undefined;
  if (!r) throw new Error(`Seed error: router ${serial} missing`);
  return r.id;
}

function saveConnections(
  db: ReturnType<typeof openDatabase>,
  teamId: number,
  date: string,
  connections: number
) {
  db.prepare(
    "INSERT OR REPLACE INTO daily_connections (team_id, date, connections) VALUES (?, ?, ?)"
  ).run(teamId, date, connections);
}

main();
