---
name: Activity rank scope
description: Separate progression rules and the user's supplied animated bar artwork.
---

Activity ranks are server-specific chat/voice progression, separate from RPG XP, levels, stats, inventory, combat, and game rewards. Permanent progression remains; only the monthly leaderboard resets.

**Why:** The user requested dedicated activity ranks independently of the RPG.

**How to apply:** Keep activity scoring and decorative milestone roles independent of RPG progression and game pause.

The progress bar must animate over the selected common banner using the supplied normal, Pro, and Sword generator artwork, rather than appearing below the banner as a separate bar.

**Why:** The user explicitly clarified that the bar should load over the chosen banner, then supplied the three bar generators.

**How to apply:** Preserve the supplied designs and overlay placement in both Discord rank cards and the website preview; do not silently substitute a generic progress bar.

Banner rendering reads app uploads directly and only fetches an explicit allowlist of trusted public image hosts.

**Why:** Guild configuration permission must not give an operator access to the bot host's internal network. Blocking literal IPs is insufficient because DNS aliases can resolve to private addresses.

**How to apply:** Do not restore arbitrary external-host fetching. Any artwork can still be uploaded; vet additional CDN hosts explicitly and keep redirects disabled.

Use the user's fiery dragon artwork with the “REGATUL CENUȘII” title as the default banner. Replace its fixed XP artwork with the supplied animated bar and place the /rank member's name and avatar beneath that bar.

**Why:** The user explicitly requested this image as the default and the command member beneath the XP bar.

**How to apply:** Blank banner settings mean the default artwork, not an empty background. Preserve custom banner overrides and the original dragon/title composition.
