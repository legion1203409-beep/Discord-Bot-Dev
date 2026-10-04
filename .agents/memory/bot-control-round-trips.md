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

Channel provisioning should not send an immediate chest just because it created the chest destination. Verification is different: when enabled and fully configured, it has a persistent panel that can be published through its reconciliation path after the destination is saved.

**Why:** A one-off chest sent during provisioning can overlap the scheduler's next event or active-chest recovery, while a verification panel is expected to remain in its channel.

**How to apply:** Persist and refresh channel routing before relying on it; leave timed gameplay posts to the existing scheduler. Report verification panel publication failures as partial results instead of claiming the entire provisioning operation failed.

An invalid settings draft should stay visible after a failed save, with an explicit unsaved indication, rather than silently resetting the control that caused the validation error.

**Why:** Enabling private Discord activity logs without selecting a viewer role correctly fails validation; resetting the toggle on error made the UI appear disabled while the toast complained about an enabled log, obscuring the cause. Private log provisioning still must require a viewer role.

**How to apply:** Validate prerequisites before submitting, explain them beside the affected control, and keep the draft after failures. Distinguish "enabled in the form" from "saved and active".

When a full bot-control form resubmits an unchanged Discord destination that has since become invalid, do not let it block unrelated settings. Validate the destination when its ID changes, including when it is cleared or replaced.

**Why:** A deleted legacy channel can otherwise make every save fail, even when the operator is editing a separate message or gameplay setting.

**How to apply:** Compare submitted destination IDs with the persisted config before making live Discord checks; keep strict validation for newly selected targets.