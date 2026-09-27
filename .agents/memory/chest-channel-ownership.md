---
name: Chest channel ownership
description: Keep the main gameplay channel dedicated to chest posts rather than mixing in Oracle content.
---

The `main` gameplay destination is a chest-only channel. Do not start proactive Oracle posts there, post daily statistics there, or use it as a fallback for Oracle Council. Reports and Council posts require their own explicit destinations; Oracle replies remain independent.

**Why:** The operator explicitly corrected the combined “Cufere și Oracol” configuration; the selected channel is intended only for chests, rewards, and keys. A daily report fallback reused it and crowded out the expected gameplay posts.

**How to apply:** Label the destination “Cufere” in every control surface and command. Provision new servers with a `cufere` channel while retaining the old combined name only as a migration/reuse alias. Require explicit separate channels for reports; never silently fall back to `main`.