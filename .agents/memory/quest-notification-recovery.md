---
name: Quest notification recovery scope
description: Keep Discord notification retries separate from combat and inventory settlement.
---

Notification recovery must retry only the same Discord message update, without
re-running combat or granting a daily quest reward again. Inventory atomicity is
separate work.

**Why:** The user explicitly limited this work to Discord delivery after a
temporary failure; the quest reward claim has already happened at that point.

**How to apply:** Preserve the original reward text and level-up presentation on
retry. The current scope covers recovery in the running bot; recovery after a
process restart is a separate reliability extension, not a guarantee to imply.
