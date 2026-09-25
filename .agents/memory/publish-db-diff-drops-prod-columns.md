---
name: Publish DB diff drops prod columns
description: Why prestige/talisman data got wiped on publish and how to prevent it
---

Replit's Publish flow diffs the **development database** against the production
database and applies the diff to prod. Columns/tables that exist in prod but not
in the dev DB get **DROPPED on publish** (data loss), then the bot's startup
migrations silently re-create them empty — this is what repeatedly reset
prestige (and put talisman columns at risk).

**Why:** the bot only runs in production (NODE_ENV gate), so its startup
ALTER TABLE migrations never touch the dev DB. Editing `lib/db/src/schema/*`
alone is NOT enough — the publish diff reads the dev *database*, not the schema
files.

**How to apply:** after any schema change (including runtime-migration-style
columns), sync the dev DB before the user publishes:
`pnpm --filter @workspace/db run push-force`. If push hits interactive prompts
or ordering errors from drift, dev data is disposable — TRUNCATE/DROP the
drifted dev tables and re-run push-force. Verify parity with an
information_schema column diff between dev and prod before declaring it safe.

Inspect the raw statements in a pending publish diff, not only its safety
flags. A diff can report `hasStructuralDataLoss: false` and empty removal lists
while its statements still include `DROP TABLE ... CASCADE`.

**Why:** A summary flag concealed destructive SQL when production-only tables
were absent from development.

**How to apply:** Before recommending publish, review every SQL statement for
DROP/TRUNCATE operations. Reconcile missing development schema additively,
then recompute the diff until it contains no unintended destructive statements.
