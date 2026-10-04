---
name: Guide loading animation
description: The user's intended gate animation and where it should appear.
---

Keep the medieval gate loading screen with animated torches, rising portcullis, floating embers, and a red progress bar on `/joc` and when entering the moderation panel. The obsolete shield/checkmark `DiscordLoadingScreen` must not be restored.

**Why:** The user clarified that the gate is the newer screen to keep and asked to remove the older Discord shield/checkmark loading screen instead.

**How to apply:** Use the gate while the moderation session/auth configuration loads, then show the robot-branded login screen. Do not replace it with the old Discord loader.