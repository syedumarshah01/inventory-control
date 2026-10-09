/**
 * One-click backup of the SQLite file into backups/.
 *   npm run db:backup
 */
import { openDatabase, backupDatabase, dbPath } from "../src/lib/db";

const db = openDatabase();
const dest = backupDatabase(db);
console.log(`Backed up ${dbPath()}`);
console.log(`       →  ${dest}`);
db.close();
