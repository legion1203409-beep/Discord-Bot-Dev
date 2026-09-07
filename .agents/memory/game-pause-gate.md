---
name: Game pause gate
description: Durable rule for pausing and resuming all guild gameplay safely.
---

Stopping a guild's game must be enforced at two boundaries: scheduled producers must refuse to spawn or settle gameplay, and interaction dispatch must reject existing combat, chest, boss, and reward buttons while paused. Independent schedulers need their own pause check rather than relying only on the main scheduler.

**Why:** Existing timers and already-posted Discord buttons continue to exist after a scheduler is stopped; pausing only the main scheduler lets old interactions or separate systems such as Tribute keep mutating gameplay.

**How to apply:** Any new gameplay producer, timer callback, reward settlement, or interactive handler must check the guild pause state. Administrative start/stop and non-game support flows may remain available while paused.