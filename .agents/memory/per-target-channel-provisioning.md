---
name: Per-target channel provisioning
description: User-requested isolation and draft-preservation rules for moderation channel creation.
---

Each moderation channel button creates or reuses its mapped group category and creates or reuses only the requested text destination. The category and destination deny `@everyone`, allow viewing for configured moderation staff roles, and retain bot access. If no staff role is configured, use saved per-category provisioning roles; if neither source has a role, reject before creating Discord channels. Revoke only `ViewChannel` from other explicit viewer overwrites, preserving every other ACL bit.

Activity-log buttons create or reuse the shared journal category and only the requested text destination. Use configured staff roles for visibility, falling back to the journal's configured viewer roles when no staff roles exist. Keep the activity toggles unchanged when only provisioning a channel.

After a successful create, apply the requested channel ID and returned category ID (system-owned metadata) to the latest local draft. Do not replace the whole draft with the API response; preserve unrelated unsaved edits.

**Why:** The user asked for categories containing moderation destinations and staff-only visibility, superseding the earlier no-parent-category behavior. Category metadata must also survive a later save from a stale local draft.

**How to apply:** Keep requests target-specific, map each moderation destination to its existing category group, reuse that category on later clicks, and never create sibling destinations as a side effect.