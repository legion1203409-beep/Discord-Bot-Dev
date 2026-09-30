---
name: Discord no-DM policy
description: Product decision to avoid all bot-originated Discord direct messages.
---

The bot must not send Discord direct messages to users, whether for moderation warnings, server onboarding, gameplay guidance, or future features. Private responses to interactions inside a server are not DM inbox messages and remain allowed.

**Why:** The user explicitly chose to stop all bot DMs rather than only the AutoMod/AI warning DMs shown in their screenshot.

**How to apply:** Use an appropriate guild channel for user-visible notices when available. Keep warnings in the moderation ledger and make it explicit when no channel notification was delivered; do not treat a failed channel send as permission to fall back to DM. Onboarding may use the server's system channel.