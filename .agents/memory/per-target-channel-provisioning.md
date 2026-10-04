---
name: Per-target channel provisioning
description: User-requested isolation and draft-preservation rules for moderation channel creation.
---

Each moderation channel button creates or reuses its mapped group category and creates or reuses only the requested text destination. New categories and destinations deny `@everyone` and retain bot access; do not apply or revoke staff-role overwrites. Role access is configured directly in Discord, and existing role overwrites must be preserved when reusing a channel.

Activity-log buttons create or reuse the shared journal category and only the requested text destination, with the same private defaults and manual Discord role access. Keep the activity toggles unchanged when only provisioning a channel.

After a successful create, apply the requested channel ID and returned category ID (system-owned metadata) to the latest local draft. Do not replace the whole draft with the API response; preserve unrelated unsaved edits.

**Why:** The user chose to manage role access in Discord after staff-role prerequisites blocked channel creation. New channels must remain private by default, while panel roles must not control channel ACLs. Category metadata must also survive a later save from a stale local draft.

**How to apply:** Keep requests target-specific, map each moderation destination to its existing category group, reuse that category on later clicks, preserve manually configured role overwrites, and never create sibling destinations as a side effect.