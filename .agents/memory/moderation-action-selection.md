---
name: Moderation action selection
description: User's clarified requirement for choosing combined actions in AutoMod and AI moderation.
---

Operators must be able to visibly select combined actions in both AutoMod and AI moderation, including for individual AI categories. The user's examples were deletion plus mute and deletion plus warning.

**Why:** The user rejected the earlier separate deletion-switch implementation and clarified that they wanted the two action choices together on both pages.

**How to apply:** Keep the selected combination visible rather than exposing only a single-action menu. Individual AI categories must support their own combination, not merely a global deletion setting. Verify the actual category editor as well as the classic AutoMod editor when changing this behavior.