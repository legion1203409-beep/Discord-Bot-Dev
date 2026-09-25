---
name: Moderation safety boundaries
description: Identity, sanction, and attribution decisions for moderation independent of the RPG.
---

Do not substitute a workspace Discord connector for each moderation visitor's own Discord identity.

**Why:** The workspace connection represents the creator's account, whereas the moderation panel serves different users with different server permissions. Connecting that account cannot authenticate arbitrary visitors.

**How to apply:** When changing sign-in providers, preserve per-user Discord authorization instead of using the workspace account's server list. Keep bot-membership and staff checks independent of the chosen sign-in method.

Moderation remains independent of the RPG pause state. Rule severity adjusts detection sensitivity, not the configured sanction; only explicitly enabled escalation may promote sanctions.

**Why:** Stopping the game must not disable server protection, and choosing a warning must not silently authorize a ban.

**How to apply:** Check parent module toggles and protected targets before every effect, including deletion. An attempted or uncertain moderation effect must not fall through to the legacy Oracle guard and produce a second sanction.

Do not infer who deleted a message or changed roles from the affected member.

**Why:** Discord events often identify the target, not the actor. Punishing the target can sanction a victim of staff activity.

**How to apply:** Use reliable actor attribution where available; otherwise alert staff without automatic punishment.

Automatic warnings need a safe delivery fallback when members block DMs; they must retain the source channel context without bypassing the moderation action ledger.

**Why:** An attempted emoji warning can be correctly detected but marked failed when DM delivery is unavailable, making moderation appear inactive and causing later same-minute attempts to hit the failed incident record.

**How to apply:** Preserve the message channel on warning actions, and keep failed or uncertain ledger outcomes terminal rather than blindly retrying a possibly applied sanction.

Repetition enforcement needs a floor of two occurrences, and repeated-message counting must distinguish messages from repeated processing of the same message.

**Why:** Hard severity can scale a configured minimum of two down to one, falsely matching ordinary text. Edit events recheck content, so event-counting alone could also punish a single edited message as a repeated send.

**How to apply:** Keep the minimum for consecutive characters and identical messages at two; count distinct message IDs inside the configured time window, and let prior blocked-content checks take precedence over repeated-message sanctions.

Message-spam counters must observe eligible messages before any content-rule action returns, but count each Discord message ID only once across edits or event replays. Apply at most one sanction to a message.

**Why:** A rule chain that returns after AutoMod detections can starve a later spam counter, making active Anti-spam settings appear inert; naively moving the counter earlier without deduplication makes edited messages look like new sends.

**How to apply:** Record the unique message before rule precedence checks; keep explicit forbidden-word/link actions ahead of generic burst actions, and never use message edits to increase send rate.

Deduplicating one moderation alert must not exit an event handler before other independent protections see the event.

**Why:** A repeated join/leave alert could be on cooldown while a new join still needed Anti-raid evaluation; returning from the shared handler silently skipped Anti-raid.

**How to apply:** Scope cooldown checks to their own alert/action block. Continue recording the event for separately configured protection modules, while retaining one sanction per independent incident.

The preview proxy terminates browser HTTPS before Express; the observed request protocol may be HTTP while the preserved Host still names the public development host.

**Why:** Comparing a browser Origin to Express's protocol plus Host rejected legitimate login requests behind the proxy.

**How to apply:** Verify origin protections through the real proxied URL, not only localhost tests. Do not compensate by allowing arbitrary origins or trusting arbitrary forwarded-host headers.