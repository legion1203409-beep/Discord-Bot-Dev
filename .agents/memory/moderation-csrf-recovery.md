---
name: Moderation CSRF recovery
description: Why stale moderation CSRF tokens can occur and when retrying a mutation is safe.
---

The moderation UI can hold an old CSRF token after another tab signs in with Discord and replaces the session cookie. Refresh the server session before retrying a rejected mutation, but only for the exact CSRF rejection, the same user and guild, and at most once.

**Why:** The server rejects this specific token mismatch before performing any write or Discord publication, so a single retry is safe. Other 403s or a changed account are not evidence that retrying the same draft is safe.

**How to apply:** Keep cookie and token paired through the session endpoint. Route every authenticated moderation mutation, including emoji creation and upload-URL requests, through the same session-aware client; the actual signed storage upload is separate. Never bypass CSRF checks, replay other failed writes, or reuse an old guild draft after an identity or guild switch.