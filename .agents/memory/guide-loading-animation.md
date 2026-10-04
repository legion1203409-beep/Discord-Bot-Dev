---
name: Guide loading animation
description: The user's intended gate animation and where it should appear.
---

Keep the medieval gate loading screen with animated torches, rising portcullis, floating embers, and a red progress bar on `/joc`. Use the older shield/checkmark `DiscordLoadingScreen` while the moderation session and auth configuration load; do not show the gate on moderation entry.

**Why:** The user reported two loading screens on mobile, preferred the older moderation loader, and asked to remove the new gate from that flow.

**How to apply:** Keep `GameGuideLoadingScreen` on `/joc`; show `DiscordLoadingScreen` during moderation session/auth loading, then show the robot-branded login screen.