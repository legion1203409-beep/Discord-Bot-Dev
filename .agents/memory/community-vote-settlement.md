---
name: Community vote settlement
description: Reliability rule for Discord votes that close first and distribute rewards afterward.
---

Treat “voting closed” and “reward delivered” as separate persisted states. A closed vote without a reward marker must be retried during rehydration, and the public result must state what was granted and how many players received it.

**Why:** A transient database or Discord failure after closing previously made later attempts return early, leaving a completed vote with no visible or actual outcome.

**How to apply:** Use this for every timed community vote or collaborative objective whose settlement spans multiple operations. Keep completed-message cleanup restart-safe as well.