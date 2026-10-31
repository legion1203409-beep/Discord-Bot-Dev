---
name: Discord OAuth environments
description: Environment-specific callback configuration required by the moderation panel's Discord OAuth flow.
---

The moderation panel's Discord OAuth callback must be configured separately for development and production. Having `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, and a production `DISCORD_OAUTH_REDIRECT_URI` is not enough for the preview workflow; development must have its own exact callback URL registered in Discord.

**Why:** The OAuth implementation intentionally fails closed when the redirect URI is absent, so preview shows the normal "authentication unavailable" state even though the API and production configuration are healthy.

**How to apply:** When preview login is unavailable, check the development environment for `DISCORD_OAUTH_REDIRECT_URI` and register the matching `/api/moderation/oauth/discord/callback` URL in the Discord application without overwriting the production callback.

The browser RPG may reuse the moderation callback transport, but OAuth state must distinguish the player flow and create a separate player session. Keep the player cookie available to that shared callback so a re-login can revoke the previous player session; moderation routes must continue to ignore it.

**Why:** The callback lives under `/api/moderation/oauth/discord/callback`, while player endpoints live under `/api/game`; a cookie scoped only to `/api/game` is not sent to the callback and cannot be rotated there.

**How to apply:** Preserve purpose-specific OAuth state and session tables. If the callback path changes, re-check the player cookie scope and continue requiring the player session and CSRF token on game mutations.