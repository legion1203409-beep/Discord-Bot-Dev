---
name: Per-target channel provisioning
description: User-requested isolation and draft-preservation rules for moderation channel creation.
---

Each channel-creation control must create or reuse exactly one activity-log category or moderation destination. It must not provision sibling destinations. After the server saves the canonical config and revision, the UI applies only that destination's returned channel ID to the latest local draft so unrelated unsaved edits survive.

**Why:** The user clarified that the request covers both activity-log categories and moderation systems, with one destination per button and preservation of draft edits.

**How to apply:** Keep provisioning requests target-specific. On success, update the latest draft at only the target field; do not replace the whole draft with the API response.