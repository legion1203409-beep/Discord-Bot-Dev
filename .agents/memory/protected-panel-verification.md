---
name: Protected panel verification
description: Why moderation verification must exercise authenticated navigation and multi-guild state.
---

A screenshot of the login gate is not verification of the administration panel behind it. Exercise real navigation, shared server selection, configuration saving, and command submission in browser tests with test-only network fixtures.

**Why:** Login screenshots and shape-only tests passed while nested links led to unfinished-page fallbacks and individual forms retained a different guild from the visible selector.

**How to apply:** Use two guilds in a test-only authenticated session and click the actual menu links. Check request guild IDs and persisted values after switching and reloading. Keep these fixtures in the test harness; never add a shipped authentication bypass or perform test sanctions on a live community.