---
name: Atomic protection toggles
description: Server-side save boundary for moderation protection switches.
---

Dashboard protection switches should use a dedicated server-side mutation that reads the current configuration and changes only the requested protection key. Full-config browser PUTs are too vulnerable to stale ETag conflicts for quick toggles.

**Why:** Repeated 409 responses made a valid deactivation look broken even when the switch event fired.

**How to apply:** Keep the toggle mutation narrow, retry revision conflicts on the server, return the new config/version, and keep the UI optimistic with rollback on a final failure.