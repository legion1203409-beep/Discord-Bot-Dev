---
name: Oracle AI replies
description: How/why the Oracle answers mentions with AI, and the Discord content-intent nuance that bounds it.
---

# Oracle AI replies

The Oracle answers in-character (dark-fantasy Romanian) when a player @mentions the
bot or replies to one of its messages. Replies are AI-generated (model `gpt-5-mini`),
short, and colored by `getCurrentMood()`.

**Provider:** uses the user's OWN `OPENAI_API_KEY` secret + the `openai` SDK directly,
NOT Replit AI Integrations.
**Why:** `setupReplitAIIntegrations` returned `awaiting_phone_verification` and the user
chose to supply their own key. If revisiting, the keyless proxy needs phone verification
first.

**Discord content-intent nuance (the key constraint):** Discord delivers
`message.content` for a message that @mentions the bot, AND for a reply whose ping is ON
(default) — even WITHOUT the privileged MessageContent intent. But a reply with the ping
turned OFF withholds `content` unless MessageContent is enabled.
**How to apply:** detection keys on `message.mentions.users.has(botId)` (covers @mention +
pinging reply) plus a reference/author check for non-pinging replies; but if `content` is
empty we cannot personalize, so non-ping replies are intentionally skipped while
`ORACLE_MESSAGE_CONTENT_ENABLED` is off. Enabling that intent makes all replies answerable.

**gpt-5 family params:** use `max_completion_tokens` (NOT `max_tokens`); `temperature` is
not specifiable (always 1). Applies to any gpt-5* call in this repo.

**Cost/abuse guards:** per-user cooldown + global hourly cap. Reserve the global slot
synchronously (check-then-push with no await between) right before generating, or
concurrent mentions overshoot the cap. Never log message content (length/mood only).
`allowedMentions: { repliedUser: true, parse: [] }` so AI text can't trigger @everyone/role.
