---
name: Guild-local settings
description: Product rule for keeping dashboard and gameplay settings independent across Discord servers.
---

Every Discord server must keep its own settings and gameplay active/paused state. Changing a setting or stopping gameplay in one server must not change another server.

**Why:** The user explicitly wants each server to have independent settings; a global setting can unintentionally disable or alter unrelated servers.

**How to apply:** For guild-specific reads and writes, carry the selected guild ID through the UI, API route, database key, cache, and scheduler. Add a two-guild regression test for any new server-level toggle.
