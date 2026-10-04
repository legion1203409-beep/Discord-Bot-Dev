---
name: Per-target channel provisioning
description: User-requested isolation and draft-preservation rules for moderation channel creation.
---

Each channel-creation control must create or reuse exactly one requested text destination. It may place the channel in a matching category that already exists, but must not create a parent category or sibling destinations as side effects. After the server saves the canonical config and revision, the UI applies only that destination's returned channel ID to the latest local draft so unrelated unsaved edits survive.

**Why:** The user clarified that one button should create only its selected destination; automatically creating a parent category made one click add multiple Discord channels.

**How to apply:** Keep provisioning requests target-specific. On success, update the latest draft at only the target field; do not replace the whole draft with the API response.