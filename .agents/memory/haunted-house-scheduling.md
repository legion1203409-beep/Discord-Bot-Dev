---
name: Casa Bântuită scheduling
description: Product rules for the automated Halloween event and scheduled AI stories.
---

Casa Bântuită stays open for 10 minutes, then its next opening is scheduled at a random 2–4 hour delay. Final scores publish to the configured leaderboard channel. Automated AI horror stories go to a separately configured game-chat channel every two hours, never to the start-announcement channel or the chest-only main channel.

**Why:** the user explicitly requested an automatic short event cycle and wanted AI stories to appear in chat rather than announcements.

**How to apply:** keep all channel targets guild-scoped and validated, persist scheduler deadlines, and run this event/story scheduler independently of the RPG pause gate.
