---
name: Moderation config ETag retries
description: How the moderation dashboard should handle concurrent configuration edits.
---

Protection settings are saved with an optimistic ETag/version check. A stale dashboard snapshot can receive a 409 even when the user's change is valid, so toggle saves should refetch the latest config and reapply only the intended field before retrying once.

**Why:** The dashboard and other configuration writers can overlap, and treating a 409 as a permanent failure makes working toggles appear broken.

**How to apply:** Keep the requested change as a transform function over the latest config; never retry the entire stale object blindly, and surface a clear error if the retry also conflicts.