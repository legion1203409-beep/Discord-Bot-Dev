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

Use the user's fiery dragon artwork with the “REGATUL CENUȘII” title as the default banner. Replace only its fixed progress bar with the supplied animated bar; keep the round XP medallion and place the /rank member's name and avatar beneath the bar without covering the medallion.

**Why:** The user explicitly requested this image as the default and the command member beneath the XP bar.

**How to apply:** Blank banner settings mean the default artwork, not an empty background. Preserve custom banner overrides and the original dragon/title composition.

All seven supplied styles must have very thin progress lines and no opaque exterior backplate. Preserve the dark unfilled track and intentional artwork details.

**Why:** The user explicitly asked for all bars to be “subțire de tot,” with “bila aia de xp” retained, after pointing out the unwanted black background.

**How to apply:** Treat the circular XP emblem as separate from the thin progress line. Do not erase dark details globally or flatten the sword's hilt, runes and animation into a generic bar.

Activity XP must have no daily cap, whether from chat, voice, or their combined total. Chat awards use a 30-second cooldown; other eligibility and anti-spam rules remain.

**Why:** The user explicitly requested unlimited daily activity XP and a 30-second message cooldown.

**How to apply:** Do not reintroduce daily caps as anti-farming defaults or replace them with artificially large limits. Keep voice cadence and RPG progression separate.
