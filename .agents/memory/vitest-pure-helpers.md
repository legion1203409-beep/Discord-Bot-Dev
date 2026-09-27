---
name: Vitest pure helpers
description: Keep deterministic editor validation tests independent of React component and app-alias imports.
---

Put deterministic configuration validation in dependency-light helper modules and test those modules directly. Reuse the same helper from the editor and the save preflight.

**Why:** Importing the moderation editor for a helper test also pulled in `@/lib/utils`, which the status Vitest run could not resolve from that test. Isolating the validator avoided coupling a pure logic test to React component and alias setup.

**How to apply:** When adding form or configuration validation, export the pure function from `src/lib/` and import it in both the editor and its unit test. Only import/render the React editor when testing component behavior itself.