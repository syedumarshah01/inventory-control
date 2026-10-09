# Inventory Tracker

Track every **fiber piece** and **router** handed to your installation teams —
what went out, what came back, and what's left to reuse tomorrow. Single-user,
single SQLite file, one password.

Next.js + TypeScript + Tailwind CSS + SQLite (better-sqlite3).

## Quick start

```bash
npm install
cp .env.example .env     # set AUTH_PASSWORD (default: changeme)
npm run dev              # http://localhost:3000
```

The database (`data/inventory.db`) is created on first start. To load demo data
(3 teams, 2 drums, 20 routers, realistic history):

```bash
npm run db:seed          # wipe & reseed later with: npm run db:reset
```

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the app |
| `npm run build` / `npm start` | Production build / serve |
| `npm test` | Tests for the core rules (split, return, transitions, duplicates) |
| `npm run db:seed` / `npm run db:reset` | Demo data / wipe + reseed |
| `npm run db:backup` | Copy the database into `backups/` |

## The five screens

1. **Today** — stock levels, what each team holds, alerts (items out too long,
   low stock, team not closed out). Click a team to close its day.
2. **Issue** — pick team, add fiber (whole piece, or type meters to cut from a
   larger one) and routers (paste serials). Confirms with a printable handover
   slip. The pool is sorted **smallest pieces first** so leftovers get used
   before opening a new drum.
3. **Return** — everything the team holds; enter remaining meters per piece
   (or "with team" if they keep it overnight) and an outcome per router
   (installed / back / faulty / with team). Small remainders offer a one-click
   "scrap?". Save closes out the day.
4. **Fiber** / **Routers** — receive stock inline, filter, search, open any item
   for its full history (and lineage for fiber). Corrections need a reason and
   are logged; nothing is ever deleted.
5. **Settings** — teams, thresholds (scrap meters, low stock, overdue days),
   password, database backup.

## How the pieces work

- Receiving a drum creates one pool piece `DRUM-001-A` of the full length.
- Issuing 100 m from a 150 m piece cuts it: a 100 m piece goes to the team
  (`DRUM-001-A1`), the 50 m remainder stays in the pool.
- Returning with 40 m left of a 200 m piece: 160 m is recorded as used, the
  piece is consumed, and a new 40 m pool piece (`…-A11`) is created — ready for
  any team tomorrow.
- Routers: serials are unique; bulk-add flags duplicates; you can't issue a
  router twice.
- Every issue/return is one database transaction — a failed save writes nothing.

## Backup & restore

Everything lives in `data/inventory.db`. A daily copy is written to `backups/`
automatically on first use; you can also grab one from **Settings → Download
database** or `npm run db:backup`. To restore: stop the app, replace
`data/inventory.db` with the copy, start again.

## Tests

`npm test` — 40 tests cover the rules above (splits, remainders, used-length
math, router transitions, duplicate serials, atomicity, error messages).
