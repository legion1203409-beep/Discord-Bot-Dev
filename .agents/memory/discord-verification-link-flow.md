---
name: Direct Discord verification links
description: The user's chosen verification flow for direct Link buttons in Discord.
---

The user chose to keep the current slider-based verification when changing the Discord verification panel to open directly. Do not replace this with automatic role assignment after OAuth.

**Why:** the user wanted direct navigation without removing the existing verification challenge.

**How to apply:** a Link button cannot create a user-specific ticket itself, so bind the Discord identity through OAuth, issue a one-time ticket, then let the existing slider completion grant the role.
