---
name: Moderation channel destinations
description: Preserve operator intent when a moderation log destination is invalid or inaccessible.
---

## Rule
When a configured moderation destination is unavailable, keep its ID visible and explain the problem. Offer valid text-channel choices or explicit clearing, but never silently redirect logs to another channel.

**Why:** The user requires invalid destinations to be identified without guessing where logs should move; audit logging may intentionally use a separate destination from category activity logs.

**How to apply:** Keep the configured destination unchanged until the operator chooses a replacement. Do not infer a production channel from available channels or route an audit log through a different activity-log category.