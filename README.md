# Inventory Tracker

Inventory control for a broadband company's installation teams: every **fiber piece**
(cut from drums, split, returned, reused) and every **router** is tracked individually
with a full audit history. Single-user app — one password, one SQLite file.

Built with Next.js (App Router) + TypeScript + Tailwind CSS + SQLite (better-sqlite3).

---

## Quick start

```bash
npm install
cp .env.example .env        # then edit AUTH_PASSWORD to your own password
npm run dev                 # http://localhost:3000
```

That is all — the database is created automatically on first start
(`data/inventory.db`, schema applied on open). Optionally load demo data first:

```bash
npm run db:seed             # 3 teams, 2 drums, 20 routers, realistic history
```

Sign in with the password from `AUTH_PASSWORD` (default `changeme`).

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the app (dev server, binds 0.0.0.0:3000) |
| `npm run build` / `npm start` | Production build / serve |
| `npm test` | Automated tests (fiber split, returns, router transitions, duplicates, atomicity) |
| `npm run db:seed` | Insert demo data (refuses if the DB already has teams) |
| `npm run db:reset` | **Wipe** the database and reseed demo data |
| `npm run db:backup` | Copy the SQLite file into `backups/` |

> To start from an empty database instead of demo data: stop the app, delete
> `data/inventory.db`, start `npm run dev`. Nothing in the app ever hard-deletes
> inventory records — only the reset command removes data.

---

## Project structure

```
├── prisma/                      # (schema lives in src/lib/db.ts — better-sqlite3, no codegen)
├── scripts/
│   ├── seed.ts                  # demo data (3 teams, 2 drums, 20 routers, returns)
│   ├── reset-db.ts              # wipe + reseed
│   └── backup-db.ts             # copy data/inventory.db → backups/
├── src/
│   ├── app/                     # Next.js App Router pages & API routes
│   │   ├── login/               # single-password sign-in
│   │   ├── page.tsx             # 1. Dashboard (cards, per-team, alerts)
│   │   ├── issue/               # 2. Daily Issue + printable handover slip
│   │   ├── return/              # 3. Daily Return + reconciliation
│   │   ├── fiber/               # 4. Fiber Pool (tabs) + piece detail/[id]
│   │   ├── receive/             # 5. Receive Stock (drums, bulk routers)
│   │   ├── routers/             # 6. Router Inventory + router detail/[id]
│   │   ├── ledger/              # 7. Team Ledger
│   │   ├── reports/             # 8. Reports (CSV export everywhere)
│   │   ├── activity/            # 9. Activity Log
│   │   ├── settings/            # 10. Teams, thresholds, password, backup
│   │   └── api/                 # JSON API (all mutations; validated + transactional)
│   ├── components/              # UI kit, toasts, confirm dialogs, nav
│   └── lib/
│       ├── db.ts                # SQLite open + schema + backup (the data model)
│       ├── fiber.ts             # drums, issue/split, return/remainder, scrap, corrections
│       ├── routers.ts           # bulk add, issue, close-out, corrections
│       ├── daily.ts             # atomic Daily Issue / Daily Return operations
│       ├── reports.ts           # dashboard & report queries
│       ├── auth.ts              # password + HMAC session cookie
│       ├── settings.ts          # thresholds, session secret
│       └── csv.ts / dates.ts / links.ts / types.ts
├── tests/                       # vitest: the core rules (40 tests)
├── data/inventory.db            # the database (gitignored)
└── backups/                     # timestamped copies (gitignored)
```

## Data schema (SQLite)

```sql
teams(id, name, active, created_at)

fiber_drums(id, code UNIQUE, supplier, total_length_m, date_received, notes)
fiber_pieces(id, code UNIQUE, drum_id → fiber_drums,
             parent_piece_id → fiber_pieces,     -- lineage: cut/returned-from
             length_m > 0,
             status IN (IN_STOCK, ISSUED, CONSUMED, SCRAP),
             current_team_id → teams, created_at)
fiber_movements(id, piece_id, type, team_id, length_m, date, notes)
    -- type: CREATED_FROM_DRUM | ISSUED | RETURNED | CUT | CONSUMED
    --       | MARKED_SCRAP | CORRECTION

routers(id, serial_number UNIQUE, model,
        status IN (IN_STOCK, ISSUED, INSTALLED, FAULTY, RETURNED_TO_SUPPLIER),
        current_team_id → teams, customer_id, date_received, notes)
router_movements(id, router_id, type, team_id, customer_id, date, notes)
    -- type: RECEIVED | ISSUED | RETURNED | INSTALLED | MARKED_FAULTY | CORRECTION

daily_connections(team_id, date, connections)   -- for meters-per-connection
daily_closeouts(team_id, date, closed_at)       -- "closed out for the day"
settings(key PRIMARY KEY, value)                -- thresholds, secrets, password hash
```

### The rules the code enforces

- **Receiving a drum** creates the drum + one `IN_STOCK` piece `DRUM-001-A` of the full length.
- **Issuing fiber** either moves the whole piece to the team, or splits it
  (issue 100 m of a 150 m piece → new issued piece `…-A1` of 100 m, parent stays
  `IN_STOCK` at 50 m, `CUT` logged). Length must be > 0 and ≤ piece length.
- **Returning fiber**: `used = issued − remaining` (remaining can't exceed the piece).
  The piece becomes `CONSUMED`; a remainder > 0 becomes a **new pool piece**
  (parent = the consumed piece) so it can be issued to any team the next day.
  Remainders below the scrap threshold (default 10 m) get a one-click
  "mark as scrap" option.
- **Piece codes** follow the lineage: `DRUM-001-A` → `DRUM-001-A1` → `DRUM-004-A11`.
- **Routers**: serials are unique; bulk add flags duplicates before saving;
  issue validates every serial (`SN123 is already issued to Team 2`); close-out is
  INSTALLED (needs customer ID) / RETURNED unused / FAULTY / still with team.
- **Nothing is ever hard-deleted.** Corrections need a reason and are logged as
  `CORRECTION` movements.
- **All issue/return operations are one database transaction** — a failed save
  never leaves partial data.

---

## Backup & restore

Everything lives in **one file**: `data/inventory.db` (journal mode `TRUNCATE`,
so when the app is idle the file always contains all committed data — a plain
copy is a complete backup).

Three ways to back up:

1. **Automatic** — once a day, on first app use, a copy is written to
   `backups/inventory-<timestamp>.db` (kept for as long as you keep the files).
2. **Settings → Download database** — downloads the file to your device.
3. **`npm run db:backup`** (or Settings → "Back up now") — copy into `backups/`.

**Restore:** stop the app, replace `data/inventory.db` with your backup copy,
start the app again.

---

## Daily workflow

### ☀️ Morning — hand out stock (Daily Issue)

1. Open **Daily Issue**. Date defaults to today; pick the team.
2. The **stock pool** is listed smallest-piece-first on purpose: give teams the
   leftover pieces before opening a new drum. Use the search box / min-length
   filter / sort toggle if needed.
3. Add fiber per piece: **Add whole**, or type a meter count and **Cut & add**
   (e.g. 100 m from a 150 m piece — the 50 m remainder stays in the pool).
4. Add routers: type or paste serials (Enter adds, pasting many at once works).
   Bad serials are rejected immediately with a plain-language reason.
5. Review the summary → **Confirm issue**. A **handover slip** appears — print it
   or copy it into WhatsApp for the team to sign.

### 🌙 Evening — take back what's left (Daily Return)

1. Open **Daily Return**, pick the team. You see everything they currently hold.
2. Per fiber piece: enter the **remaining meters** from the meter markings, or
   choose **Not yet** if they keep it overnight. `used` is calculated for you.
   Small remainders offer a one-click **Mark as scrap** (below your threshold).
3. Per router: **Installed** (customer ID required) / **Returned** / **Faulty** /
   **With team**.
4. Enter **connections completed today** (for the meters-per-connection report).
5. Check the **reconciliation summary** (cable issued/used/returned; routers by
   outcome) → **Save**. The team is now marked closed out for the day (Dashboard
   reminds you about teams that haven't been).

Returned remainders automatically appear in the pool and can go to another team
tomorrow morning — no extra steps.

### 🔍 During the day

- **Dashboard** — stock levels, what each team holds, alerts (items out longer
  than N days, low router stock, teams not closed out).
- **Fiber Pool** — all pieces by tab (pool / issued / consumed / scrap / drums);
  scrap or correct pieces here; click a piece for its full lineage + history.
- **Routers** — filter by status, search serials, open a serial for its history.
- **Team Ledger** — what a team holds right now + their movement history.
- **Reports** — cable used & meters/connection per team (flags teams > 25 % above
  average), routers installed per team, items held longest. Every table exports CSV.
- **Activity Log** — the complete audit trail; filter by team, item, movement, date.
- **Settings** — teams, scrap threshold (m), low-stock threshold, overdue days,
  change password, database backup.

---

## Tests

```bash
npm test
```

40 tests cover the core rules: drum receive, fiber split on partial issue
(incl. validation), return → new pool piece & used-length calculation,
scrap threshold behavior, corrections requiring reasons, router bulk-add
duplicate handling, router status transitions (installed/returned/faulty/kept),
double-issue prevention, clear error messages, and transaction atomicity
(a failed batch saves nothing).

## Assumptions & notes

- Single-user auth: `AUTH_PASSWORD` env var (default `changeme`); **Settings →
  Change password** overrides it (stored hashed). Session cookie lasts 30 days.
- Dates on issues/returns are back-datable (default today) — handy for recording
  yesterday's handover this morning.
- "Not returned yet" simply leaves the item with the team (overnight); the piece
  appears again on the next Daily Return.
- "Closed out for the day" = the Daily Return screen was saved for that team/date
  (even if everything stayed with them).
- Fiber corrections are logged as `CORRECTION` movements with a required reason —
  the one movement type beyond the original spec's list.
- Meters-per-connection flags a team whose ratio is more than 25 % above the
  average of teams with recorded connections in the selected range.
