---
name: Retired Haunted House
description: User's decision to remove the unused Halloween event from the bot while retaining its historical data.
---

Casa Bântuită was removed from the bot, dashboard, and mockup at the user's request because it was unused. Existing `haunted_house_*` values in `bot_state` must remain untouched.

**Why:** the user asked to delete the event implementation and its code, while preserving historical data.

**How to apply:** do not reintroduce its commands, scheduling, routes, UI, or previews. Do not purge legacy database values unless the user separately asks for data deletion.
