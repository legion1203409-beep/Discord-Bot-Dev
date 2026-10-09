---
name: Discord permission target IDs
description: Keep role-overwrite ID lists free of channel and category IDs.
---

When configuring Discord permission overwrites, derive managed-role IDs from the role keys only; do not treat every ID in a shared resource map as a role ID. On retries, validate previously saved overwrite IDs against the guild's current role inventory before editing them.

**Why:** The server-setup resource map contains roles, categories, and channels. Passing a category or channel ID to Discord's overwrite editor can make ACL synchronization fail after the resource itself was already created. The apply endpoint can still return HTTP 200 with per-item failures, and older journal entries may retain those invalid IDs.

**How to apply:** Type-filter overwrite targets when saving them, sanitize historical journal values on retry, and return created resource IDs when a later permission step fails so operators can find the resource.
