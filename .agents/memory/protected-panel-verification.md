---
name: Protected panel verification
description: Why moderation verification must exercise authenticated navigation and multi-guild state.
---

A screenshot of the login gate is not verification of the administration panel behind it. Exercise real navigation, shared server selection, configuration saving, and command submission in browser tests with test-only network fixtures.

**Why:** Login screenshots and shape-only tests passed while nested links led to unfinished-page fallbacks and individual forms retained a different guild from the visible selector.

**How to apply:** Use two guilds in a test-only authenticated session and click the actual menu links. Check request guild IDs and persisted values after switching and reloading. Keep these fixtures in the test harness; never add a shipped authentication bypass or perform test sanctions on a live community.

Visual redesign checks must wait for the real page controls, not just navigation or network idle, before taking a fixture screenshot.

**Why:** An authenticated Bot Control capture showed only a spinner because its API was not mocked; that capture provided no evidence about the edited layout.

**How to apply:** Supply complete, contract-correct fixture responses and assert the expected editor is visible. Treat a loading-only screenshot as blocked verification, not a successful visual check.