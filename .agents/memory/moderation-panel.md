---
name: Authenticated moderation panel
description: The supplied panel is the visual source of truth, while real bot configuration stays on the authenticated server-backed flows.
---

Use the supplied Oracolul Cenușii HTML as the visual and motion reference for the authenticated moderation console. Preserve all existing routes and real guild-scoped configuration behavior; browser storage is for interface preferences only, not operational settings.

**Why:** The user explicitly asked to reproduce the supplied panel without removing existing features or animations, while retaining real bot configuration.

**How to apply:** When extending this console, keep actions behind existing session/guild authorization, validation, and explicit previews or confirmations for bulk changes.
