---
name: Persistent event cleanup and equipment rewards
description: Discord event/chest cleanup and equipment reward writes must survive restarts and remain transactionally consistent.
---

Discord timers are process-local, so any message whose deletion matters after expiry must be rehydrated from persistent state on scheduler startup. Claimed chest messages should be removed immediately after the public reward is posted; unclaimed persistent chests still need expiry rehydration. Equipment rewards must write inventory ownership, minimum equipment level, and first-slot activation in one transaction.

**Why:** Restarts discard in-memory timers, and separate reward writes can leave inventory and equipment views inconsistent after a partial failure.

**How to apply:** When adding a persistent Discord message or reward path, define its restart behavior explicitly and keep all coupled reward state inside one transaction.