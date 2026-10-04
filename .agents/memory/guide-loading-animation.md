---
name: Guide loading animation
description: The user's intended gate animation and where it should appear.
---

The user supplied a medieval gate loading screen with animated torches, rising portcullis, floating embers, and a red progress bar. Use it on `/joc` and whenever entering the moderation panel, including after Discord OAuth return; wait for the gate to open fully before showing page content. Never use the separate server-logo GIF as loading artwork or on moderation login.

**Why:** The user requested the full opening before content appears and clarified that the old loader must not reappear when opening the moderation panel.

**How to apply:** Treat the supplied gate, fire, ember, and progress animation as the source of truth on both routes; keep server branding separate.