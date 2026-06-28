---
name: Oracle recovery alert / fallback marker
description: Why the "Oracle back to full-reply mode" recovery alert needs an on-disk marker, not the in-memory fallback flag.
---
The Oracle sends a recovery alert when it returns to full-reply mode after a
"Message Content" portal-toggle (code 4014) fallback.

The rule: detection of "previously fell back" CANNOT rely on the in-memory
`privilegedIntentFellBack` flag alone.

**Why:** `privilegedIntentFellBack` resets on every process restart, and the
recovery path *is* a restart (operator flips the portal toggle, then restarts).
Within a single process, once it falls back it boots degraded for the rest of
that process's life (the boot gate uses the flag). So a ClientReady check that
reads only the in-memory flag would never fire on the real recovery path.

**How to apply:** A separate on-disk marker (`os.tmpdir()`, kept out of the DB
to match the bot's transient-state convention) is written on the 4014 fallback
paths and consumed once at ClientReady when in full mode. It survives an
in-container process restart but is ephemeral across a full redeploy / new
autoscale container — so the alert can be missed after a redeploy (tracked as a
follow-up to persist it durably if needed).
