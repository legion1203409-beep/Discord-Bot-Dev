---
name: Direct Discord verification links
description: The user's chosen verification flow for direct Link buttons in Discord.
---

The user chose to keep the current slider-based verification when changing the Discord verification panel to open directly. Do not replace this with automatic role assignment after OAuth.

Never show a one-time verification ticket as a bare URL in a Discord reply. Put it behind a compact Link button, and keep the public panel's Link button pointed at OAuth so members land directly on the slider after identity binding. A custom-ID button cannot force Discord to open a browser.

**Why:** the user wants the verification button to navigate cleanly without exposing an oversized URL, while preserving the existing slider challenge.

**How to apply:** bind Discord identity through OAuth, issue a one-time ticket, then let the existing slider completion grant the role. For legacy interaction replies, keep the URL only in `ButtonBuilder.setURL()` and not in visible message text.
