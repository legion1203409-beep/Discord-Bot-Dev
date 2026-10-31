---
name: Discord no-DM policy
description: Product decision to avoid bot-originated Discord direct messages, with one opt-in exception for sanctions.
---

The bot must not send Discord direct messages to users, whether for moderation warnings, server onboarding, gameplay guidance, or future features. Private responses to interactions inside a server are not DM inbox messages and remain allowed.

**Exception (opt-in):** the sanction DM (`sanctionDm` in the moderation config, Setări bot → Mesaj privat) may tell a member about a warn, mute, kick or ban. It is off by default and only an administrator can turn it on. It never fires for raid actions, and automatic sanctions only send it when that is allowed separately. A failed DM is logged in the audit and is not retried through another channel.

**Why:** The user first chose to stop all bot DMs rather than only the AutoMod/AI warning DMs shown in their screenshot. Later, they asked for the sanction message as an option that stays off unless they turn it on, and confirmed that it should stay.

**How to apply:** Use an appropriate guild channel for user-visible notices when available. Keep warnings in the moderation ledger and make it explicit when no channel notification was delivered; do not treat a failed channel send as permission to fall back to DM. Onboarding may use the server's system channel. Do not add other DM features, or make the sanction DM on by default, without the user asking.
