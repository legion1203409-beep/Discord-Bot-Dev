---
name: Moderation safety boundaries
description: Identity, sanction, and attribution decisions for moderation independent of the RPG.
---

Moderation staff identity is established through a short-lived, single-use code issued privately by the Discord bot, rather than an unrelated website account.

**Why:** Discord membership and current guild permissions are the authority for moderation. A website account alone cannot prove either.

**How to apply:** Keep the exchange scoped to the identity verified by Discord and re-fetch current membership/permissions for protected requests. Never introduce a development login bypass into the shipped app.

Moderation remains independent of the RPG pause state. Rule severity adjusts detection sensitivity, not the configured sanction; only explicitly enabled escalation may promote sanctions.

**Why:** Stopping the game must not disable server protection, and choosing a warning must not silently authorize a ban.

**How to apply:** Check parent module toggles and protected targets before every effect, including deletion. An attempted or uncertain moderation effect must not fall through to the legacy Oracle guard and produce a second sanction.

Do not infer who deleted a message or changed roles from the affected member.

**Why:** Discord events often identify the target, not the actor. Punishing the target can sanction a victim of staff activity.

**How to apply:** Use reliable actor attribution where available; otherwise alert staff without automatic punishment.

The preview proxy terminates browser HTTPS before Express; the observed request protocol may be HTTP while the preserved Host still names the public development host.

**Why:** Comparing a browser Origin to Express's protocol plus Host rejected legitimate login requests behind the proxy.

**How to apply:** Verify origin protections through the real proxied URL, not only localhost tests. Do not compensate by allowing arbitrary origins or trusting arbitrary forwarded-host headers.