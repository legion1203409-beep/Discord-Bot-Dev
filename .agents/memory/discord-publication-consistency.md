---
name: Discord publication consistency
description: Resource locking and uncertainty rules for persistent messages and decorative role IDs.
---

Serialize decorative role resolution for the whole guild, not only the individual level threshold.

**Why:** All milestone IDs are saved together. Locks per threshold can avoid duplicate roles at that threshold while still overwriting another simultaneous threshold's saved ID.

**How to apply:** Protect the complete read/create/save cycle for a guild, retain existing IDs, and never let an older queued promotion replace an already-held higher milestone.

Failed history lookup, persisted-ID lookup, message fetch or message edit is uncertainty, not proof that a persistent Discord message is absent.

**Why:** Reposting after transient failures creates duplicate leaderboards and ticket panels. Only a definite deleted-message response establishes that replacement is safe.

**How to apply:** Abort and retry later on uncertain failures; serialize vote settlement through result publication and persistence so timer, click and recovery paths cannot publish independently.
