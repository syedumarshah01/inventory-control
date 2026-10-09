/**
 * Reset the database: delete the SQLite file, recreate the schema, reseed.
 *   npm run db:reset
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { dbPath } from "../src/lib/db";

const file = dbPath();
for (const suffix of ["", "-wal", "-shm"]) {
  const p = file + suffix;
  if (fs.existsSync(p)) {
    fs.rmSync(p);
    console.log(`Deleted ${path.basename(p)}`);
  }
}
console.log("Database wiped. Reseeding…");
const r = spawnSync("npx", ["tsx", "scripts/seed.ts"], { stdio: "inherit" });
process.exit(r.status ?? 0);
