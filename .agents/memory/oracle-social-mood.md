---
name: Oracle social mood per guild
description: Durable constraints for proactive Oracle check-ins, sentiment-derived mood, and Discord presence.
---

Oracle activity, check-in response windows, responder deduplication, and derived mood must remain isolated per guild. A reply window should count each person once so one user cannot force the server mood by spamming. The bot's Discord presence should stay online without a game or mood activity unless the owner explicitly asks to show one.

**Why:** The bot can run in multiple guilds, while proactive questions and their answers belong only to the server where they were posted. Shared counters would let activity in one guild change the Oracle in another. The owner also requested removal of the visible game activity.

**How to apply:** Any new Oracle interaction should carry the guild ID through recording, mood lookup, and scheduling. Keep `@everyone` check-ins activity-gated and permission-checked. Do not display guild-derived mood in the global Discord presence unless explicitly requested.

Proactive mood check-ins are opt-in; the Oracle may use mood internally for replies and presence without posting unsolicited state messages.

**Why:** Public messages announcing labels such as “Extatic” were unwanted noise in private game channels.

**How to apply:** Keep `ORACLE_CHECKIN_ENABLED` unset/false unless the server explicitly wants those messages again; do not remove mood derivation from interactive Oracle replies.