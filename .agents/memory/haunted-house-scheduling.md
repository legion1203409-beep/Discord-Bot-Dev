---
name: Castelul Bântuit scheduling
description: Product rules for the automated Halloween event and scheduled AI stories.
---

Castelul Bântuit stays open for 10 minutes, then its next opening is scheduled at a random 2–4 hour delay. Entry is through an “Intră în casă” button on the opening announcement. Keep one public leaderboard message per event in the configured channel and edit it as scores change; do not require a leaderboard slash command. Automated AI horror stories go to a separately configured game-chat channel every two hours, never to the start-announcement channel or the chest-only main channel.

**Why:** the user explicitly requested an automatic short event cycle, button-based entry, the name “Castelul Bântuit”, live leaderboard updates without message spam or a leaderboard command, and AI stories in chat rather than announcements.

**How to apply:** keep all channel targets guild-scoped and validated, persist scheduler deadlines, and run this event/story scheduler independently of the RPG pause gate.
