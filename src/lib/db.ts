// SQLite (better-sqlite3) connection, schema, and backup helpers.
// Single database file — trivially backed up by copying one file.

import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { todayStr } from "./dates";

export type DB = Database.Database;

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS teams (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS fiber_drums (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  supplier TEXT,
  total_length_m REAL NOT NULL CHECK (total_length_m > 0),
  date_received TEXT NOT NULL,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS fiber_pieces (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  drum_id INTEGER NOT NULL REFERENCES fiber_drums(id),
  parent_piece_id INTEGER REFERENCES fiber_pieces(id),
  length_m REAL NOT NULL CHECK (length_m > 0),
  status TEXT NOT NULL CHECK (status IN ('IN_STOCK','ISSUED','CONSUMED','SCRAP')),
  current_team_id INTEGER REFERENCES teams(id),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS fiber_movements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  piece_id INTEGER NOT NULL REFERENCES fiber_pieces(id),
  type TEXT NOT NULL CHECK (type IN ('CREATED_FROM_DRUM','ISSUED','RETURNED','CUT','CONSUMED','MARKED_SCRAP','CORRECTION')),
  team_id INTEGER REFERENCES teams(id),
  length_m REAL,
  date TEXT NOT NULL,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS routers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  serial_number TEXT NOT NULL UNIQUE,
  model TEXT,
  status TEXT NOT NULL CHECK (status IN ('IN_STOCK','ISSUED','INSTALLED','FAULTY','RETURNED_TO_SUPPLIER')),
  current_team_id INTEGER REFERENCES teams(id),
  customer_id TEXT,
  date_received TEXT NOT NULL,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS router_movements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  router_id INTEGER NOT NULL REFERENCES routers(id),
  type TEXT NOT NULL CHECK (type IN ('RECEIVED','ISSUED','RETURNED','INSTALLED','MARKED_FAULTY','CORRECTION')),
  team_id INTEGER REFERENCES teams(id),
  customer_id TEXT,
  date TEXT NOT NULL,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS daily_connections (
  team_id INTEGER NOT NULL REFERENCES teams(id),
  date TEXT NOT NULL,
  connections INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (team_id, date)
);

CREATE TABLE IF NOT EXISTS daily_closeouts (
  team_id INTEGER NOT NULL REFERENCES teams(id),
  date TEXT NOT NULL,
  closed_at TEXT NOT NULL,
  PRIMARY KEY (team_id, date)
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_pieces_status ON fiber_pieces(status);
CREATE INDEX IF NOT EXISTS idx_pieces_team ON fiber_pieces(current_team_id);
CREATE INDEX IF NOT EXISTS idx_pieces_drum ON fiber_pieces(drum_id);
CREATE INDEX IF NOT EXISTS idx_pieces_parent ON fiber_pieces(parent_piece_id);
CREATE INDEX IF NOT EXISTS idx_fmov_piece ON fiber_movements(piece_id);
CREATE INDEX IF NOT EXISTS idx_fmov_date ON fiber_movements(date);
CREATE INDEX IF NOT EXISTS idx_fmov_team ON fiber_movements(team_id);
CREATE INDEX IF NOT EXISTS idx_routers_status ON routers(status);
CREATE INDEX IF NOT EXISTS idx_routers_team ON routers(current_team_id);
CREATE INDEX IF NOT EXISTS idx_rmov_router ON router_movements(router_id);
CREATE INDEX IF NOT EXISTS idx_rmov_date ON router_movements(date);
CREATE INDEX IF NOT EXISTS idx_rmov_team ON router_movements(team_id);
`;

export function dbPath(): string {
  return process.env.DATABASE_PATH || path.join(process.cwd(), "data", "inventory.db");
}

export function openDatabase(file: string = dbPath()): DB {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  // TRUNCATE (not WAL): this is a single-user app. TRUNCATE keeps every committed
  // byte inside the main .db file when idle — plain file-copy backups are safe, and
  // there is no -wal/-shm file that outside tooling can unlink mid-session.
  db.pragma("journal_mode = TRUNCATE");
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA_SQL);
  return db;
}

/** In-memory database with the same schema — used by tests and the seed helper. */
export function openMemoryDatabase(): DB {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA_SQL);
  return db;
}

// Singleton across Next.js dev HMR reloads.
const g = globalThis as unknown as { __inventoryDb?: DB };

export function getDb(): DB {
  if (!g.__inventoryDb) {
    const db = openDatabase();
    try {
      maybeDailyBackup(db);
    } catch {
      // Backup problems must never block the app.
    }
    g.__inventoryDb = db;
  }
  return g.__inventoryDb;
}

/** Copy the live database file into backups/ with a timestamp. Returns the file path. */
export function backupDatabase(db: DB): string {
  const dir = path.join(process.cwd(), "backups");
  fs.mkdirSync(dir, { recursive: true });
  // Opening the DB already ran journal recovery; with TRUNCATE journaling the
  // main file holds all committed data, so a straight copy is consistent.
  db.pragma("optimize");
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  const dest = path.join(dir, `inventory-${stamp}.db`);
  fs.copyFileSync(dbPath(), dest);
  return dest;
}

function maybeDailyBackup(db: DB): void {
  const today = todayStr();
  const row = db
    .prepare("SELECT value FROM settings WHERE key = 'last_backup_date'")
    .get() as { value: string } | undefined;
  if (row?.value === today) return;
  backupDatabase(db);
  db.prepare(
    "INSERT INTO settings (key, value) VALUES ('last_backup_date', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
  ).run(today);
}
