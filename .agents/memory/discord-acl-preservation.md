---
name: Discord overwrite preservation
description: Safe rules for applying configurable role access to existing Discord categories and channels.
---

When provisioning channel permissions, edit only the specific managed role targets and the ViewChannel, ReadMessageHistory, and SendMessages bits owned by this panel. Preserve other role overwrites and permission bits. When a previously managed role is removed, clear only those three managed bits rather than deleting its entire overwrite.

When a selected category applies inherited access to existing children, include every affected channel in the preview and operation report. Treat channel-specific rules as explicit exceptions rather than silently merging them with the parent policy.

**Why:** Replacing the overwrite set can silently remove unrelated server access rules, while deleting a whole role overwrite can also erase permissions maintained outside the control panel.

**How to apply:** Any future changes to Discord category/channel ACL provisioning should retain per-target edits, track the previously managed roles, and confirm the affected categories, inherited child channels, exceptions, and role-level results before applying.