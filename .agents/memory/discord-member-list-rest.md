---
name: Discord member list REST fallback
description: Loading an entire guild member list through discord.js gateway requests can hit GatewayRateLimitError even when GuildMembers is enabled.
---

For administrative member listings, use the Discord REST guild-members endpoint with pagination instead of `guild.members.fetch()` when the operation needs the full guild.

**Why:** `guild.members.fetch()` can issue opcode 8 Request Guild Members calls and fail with a gateway rate limit in production; the privileged intent being enabled does not prevent that rate limit.

**How to apply:** Fetch up to 1,000 members per REST page using the last user ID as `after`, filter by role from the API payload, and keep the gateway member intent for features that genuinely need member events.

OAuth's `guilds.members.read` scope provides the authenticated user's membership record, not a guild roster.

**Why:** User OAuth access and the bot's Guild Members intent authorize different data paths. Treating the user-only scope as roster access would leave administrative listings incomplete.

**How to apply:** Use the bot's privileged member intent plus paginated REST for full rosters; request `guilds.members.read` only for a feature that needs the signed-in user's own roles or membership details.