---
name: Activity preview synchronization
description: Keep the static rank preview and its browser cache tied to the live renderer.
---

Regenerate rank-bar preview derivatives before the frontend build, and derive their browser cache version from content rather than a manually maintained label.

**Why:** Correct regenerated public GIFs alone do not update an operator's cached images if their URLs still carry the old fixed version. Both generation and cache invalidation are needed for panel/Discord parity.

**How to apply:** Keep preview generation dependent on the same renderer and artwork as `/rank`; preserve the demonstration percentage, transparency and dimensions. Fail builds on generation errors instead of retaining stale derivatives. Do not change the original artwork or earned XP to synchronize previews.
