---
name: Bot-control round trips
description: Reliability rules for owner-console settings that must take effect in the live Discord bot.
---

Every value returned by the bot-control GET endpoint must be valid when submitted unchanged to its PUT endpoint. A successful save must update both persistent storage and the bot's active in-process configuration.

**Why:** Returning an empty default while rejecting that same value on save caused the owner console to receive HTTP 400 and made all unrelated changes appear ineffective. Persisting new event intervals without restarting the existing scheduler also delayed their visible effect.

**How to apply:** Add a round-trip test whenever bot-control fields change. Refresh the relevant cache after persistence, and restart the guild scheduler when pause state or event timing changes.

Publishing a Discord verification panel and saving its configuration are separate side effects. A successful publication followed by failed persistence is a **partial apply**, not an ordinary failed save. A retry must reuse or reconcile the bot-owned panel before sending anything new; if its identity cannot be established, fail closed.

**Why:** Treating a partial result as success hid unsaved settings, while retrying with an empty message ID could publish duplicate verification panels—especially after a page refresh or from another operator's browser.

**How to apply:** Return partial-apply details, including the published panel ID when known; keep the saved state distinct from the draft in the UI. Preserve the ID across retries, and make the bot check Discord for an existing panel when local state is incomplete. Test retries, refreshes, and uncertain Discord history without touching a live guild.