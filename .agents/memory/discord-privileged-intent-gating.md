---
name: Discord privileged intent gating
description: Why MessageContent (and other privileged gateway intents) must be gated behind an env flag, default off.
---

# Privileged gateway intent gating

Always request only the non-privileged intents the bot needs unconditionally
(e.g. `Guilds`, `GuildPresences`, `GuildMembers`, `GuildMessages`). Gate any
**privileged** intent — most notably `MessageContent` — behind an explicit env
flag that defaults to OFF.

**Why:** If the bot requests a privileged intent that is NOT toggled on in the
Discord Developer Portal, the gateway closes the connection with a fatal code
(4014 "Disallowed intent") and the bot never logs in. Because this bot only runs
when `NODE_ENV=production`, such a brick is invisible in dev — it would only
surface in prod. A default-off flag means the bot always boots; the operator
opts into the privileged feature by (1) flipping the portal toggle AND (2)
setting the env flag to `"true"`.

**How to apply:** Build the intents array with the safe set always, then
conditionally `push` the privileged intent only when the flag is `"true"`.
Features that depend on the privileged data must degrade gracefully when it is
absent (e.g. activity tracking still works from message metadata even when
message *content* is unavailable). Log a warning at startup when the privileged
feature is disabled so the operator knows why it is inactive.
