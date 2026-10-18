---
name: Suspicious moderation alert clarity
description: Keep suspicious-behavior alerts accurate about aggregate scope, trigger details, and actor attribution.
---

Describe unusual-activity counts as a guild-wide event stream unless the detector truly correlates a single actor. Include the observed count, configured limit, time window, readable event name, and affected resource when available. Identify an actor only when Discord's audit log verifies them; say explicitly when attribution is unavailable and no sanction was applied. For alert templates, label fields that do not apply instead of leaving ambiguous blanks.

**Why:** An alert that used a raw event key and empty member, moderator, and channel fields left operators unable to tell what happened or whether anyone had been sanctioned.

**How to apply:** Use this when changing suspicious-behavior alert generation or its embed templates.
