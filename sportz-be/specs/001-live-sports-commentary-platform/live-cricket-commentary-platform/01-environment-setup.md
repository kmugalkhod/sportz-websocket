# Phase 1: Environment Setup

**Tasks**: T001 – T006 | **Checkpoint**: `npm run db:studio` — verify new columns and indexes exist on both tables.

---

## T001 — Install Runtime Dependencies and Dev Tooling

### Overview
The project already has Express and Drizzle. Three production packages are missing before any server code can run: the WebSocket library, the ArcJet security SDK, and Zod for request validation. Jest and its ESM-aware globals are also needed for all test phases.

### Requirements
- `ws` — WebSocket server (noServer mode)
- `@arcjet/node` — rate limiting + bot detection
- `zod` — request body schema validation
- `jest` and `@jest/globals` — test runner (dev only)

### Key Gotchas
- Do NOT install `@types/ws` — project is plain JS, not TypeScript.
- `@jest/globals` must be installed alongside `jest` to use `describe`/`it`/`expect` with ESM `import` (no `require`-style globals).

---

## T002 — Configure Jest for ESM in `package.json`

### Overview
Node.js does not support Jest's default CommonJS transform when `"type": "module"` is set. The test script must use the experimental VM modules flag, and Jest must be told not to transform anything.

### Files to Create / Modify
- `package.json` — update `scripts.test` and add top-level `jest` config block

### Requirements
```json
"scripts": {
  "test": "node --experimental-vm-modules node_modules/.bin/jest"
},
"jest": {
  "testEnvironment": "node",
  "transform": {}
}
```

### Key Gotchas
- `"transform": {}` is required — an empty object, not omitted. Omitting it causes Jest to apply its default Babel transform, which breaks ESM `import` statements.
- The `--experimental-vm-modules` flag produces a Node.js warning on every run — this is expected and harmless.

---

## T003 — Create `.env` File at Project Root

### Overview
All secrets and runtime config live in `.env`. Nothing in `.env` should ever be committed. This file is read by `dotenv` at startup before any module references `process.env`.

### Environment Variables
```bash
DATABASE_URL=         # Neon pooler endpoint — NOT the direct endpoint. Append ?sslmode=require
RAPIDAPI_KEY=         # Cricbuzz via RapidAPI — NEVER referenced in any client-facing file
ARCJET_KEY=           # ArcJet dashboard key
ARCJET_ENV=development  # Disables ArcJet blocking locally — remove in production
PORT=8000
POLL_INTERVAL_MS=15000  # Cricbuzz polling interval in milliseconds
```

### Key Gotchas
- Use the Neon **pooler** connection string, not the direct endpoint. The pooler URL contains `.pooler.neon.tech` in the hostname. Using the direct endpoint exhausts the connection limit under load.
- `RAPIDAPI_KEY` must only appear in `.env`. If it appears in any `src/` file, that is a security violation.
- `ARCJET_ENV=development` prevents ArcJet from hard-blocking requests locally. Without it, local curl tests will get rate-limited immediately.
- Confirm `.env` is listed in `.gitignore` before committing anything.

---

## T004 — Scaffold Source and Test Folder Structure

### Overview
Creates the directory skeleton that all subsequent tasks write into. No files are created — just the folders.

### Files to Create
```
src/adapters/
src/websocket/
src/routes/
src/middleware/
src/services/
tests/unit/
tests/integration/
```

### Key Gotchas
- `src/db/` already exists — do not recreate it.
- Some hosting environments (e.g., Hostinger) do not deploy empty directories. Add a `.gitkeep` to `tests/unit/` and `tests/integration/` if needed.

---

## T005 — Extend `src/db/schema.js` with Cricket Columns and Indexes

### Overview
The existing schema has the base `matches` and `commentary` tables but is missing cricket-specific columns on `matches`, timezone awareness on all timestamps, and the composite index on `commentary` that the reconnect-cursor query depends on.

### Files to Create / Modify
- `src/db/schema.js` — add columns to `matches` table; add indexes to both tables; add `withTimezone: true` to all timestamps

### Requirements
Add to `matches` table definition:
```js
cricbuzzMatchId: integer('cricbuzz_match_id').unique(),
seriesName:      text('series_name'),
matchFormat:     text('match_format'),      // T20 | ODI | TEST
venue:           text('venue'),
homeWickets:     integer('home_wickets').default(0).notNull(),
awayWickets:     integer('away_wickets').default(0).notNull(),
homeOvers:       text('home_overs').default('0.0').notNull(),
awayOvers:       text('away_overs').default('0.0').notNull(),
```

Add indexes:
```js
// matches table
(table) => ({
  statusIdx:   index('matches_status_idx').on(table.status),
  cricbuzzIdx: index('matches_cricbuzz_idx').on(table.cricbuzzMatchId),
})

// commentary table
(table) => ({
  matchSeqIdx: index('commentary_match_seq_idx').on(table.matchId, table.sequence),
})
```

Update all `timestamp()` calls to include `{ withTimezone: true }`.

### Key Gotchas
- `commentary_match_seq_idx` is the hot path for `WHERE match_id = ? AND sequence > ?` — the reconnect missed-events query. Without it, reconnect replay will do a full table scan.
- `matchFormat` is stored as plain `text`, not an enum — avoids a Drizzle migration complexity for a three-value field.
- `homeOvers` / `awayOvers` are `text`, not `numeric` — because Cricbuzz returns over values like `"16.3"` which is not a valid decimal number (ball 3 of over 16, not 16.3 overs).

### References
- [data-model.md](../data-model.md) — full column list with types and constraints
- [data-model.md — Migration Plan](../data-model.md#schema-migration-plan) — exact Drizzle syntax

---

## T006 — Generate and Apply Drizzle Migrations to Neon

### Overview
Generates SQL from the updated schema definition and applies it to the live Neon database. This is a one-way operation on a shared database — run carefully.

### Requirements
```bash
npm run db:generate   # writes SQL to drizzle/ folder
npm run db:migrate    # applies SQL to Neon via DATABASE_URL
```

### Key Gotchas
- `db:generate` only writes SQL files locally — it does not touch the database. Review the generated SQL before running `db:migrate`.
- If `db:migrate` fails halfway (e.g., network drop), Drizzle's migration table may be in a partial state. Check `__drizzle_migrations` in Neon studio before re-running.
- Adding columns with `notNull()` and a `.default()` is safe on an existing table — Neon backfills existing rows with the default value automatically.

### Testing
After migration: open `npm run db:studio` and verify:
- `matches` table has `cricbuzz_match_id`, `home_wickets`, `home_overs`, etc.
- `commentary` table has index `commentary_match_seq_idx` listed under Indexes.
- All timestamp columns show `timestamp with time zone` type (not plain `timestamp`).
