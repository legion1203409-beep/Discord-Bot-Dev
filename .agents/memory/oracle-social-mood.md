---
name: Oracle social mood per guild
description: Durable constraints for proactive Oracle check-ins, sentiment-derived mood, and Discord presence.
---

Oracle activity, check-in response windows, responder deduplication, and derived mood must remain isolated per guild. A reply window should count each person once so one user cannot force the server mood by spamming.

**Why:** The bot can run in multiple guilds, while proactive questions and their answers belong only to the server where they were posted. Shared counters would let activity in one guild change the Oracle in another.

**How to apply:** Any new Oracle interaction should carry the guild ID through recording, mood lookup, and scheduling. Keep `@everyone` check-ins activity-gated and permission-checked. Discord presence is global to the bot account, so it can only display the most recently derived guild mood.