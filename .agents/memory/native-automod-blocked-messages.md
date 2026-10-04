---
name: Native AutoMod blocked messages
description: Preserve moderation actions for messages stopped by the bot-managed native Discord keyword rule.
---

Discord's native Keyword `BlockMessage` action can stop a message before the normal `MessageCreate` moderation path handles it. Listen for `AutoModerationActionExecution` separately, verify the exact bot-managed rule before applying a configured warning or mute, and treat the native block itself as deletion. Use the same per-guild, member, rule-kind, and minute idempotency key as the normal detector to avoid duplicate sanctions if both paths ever report one incident. Keep protected/ignored channel and role checks in place.

**Why:** Without the execution-event path, native blocked messages can bypass the configured warn/mute action. Processing every AutoMod event without verifying rule ownership could sanction users for administrator-created rules.

**How to apply:** Changes to the managed keyword rule must preserve the AutoModerationExecution intent, exact managed-rule identity check, eligibility guards, and shared idempotency key. Bot-detected messages that reach normal handling still need per-message deletion keys.

For AutoMod logs, include the original text only after a normal bot deletion succeeds; for a verified native BlockMessage event, use its content even when messageId is absent. Bound the excerpt, escape code fences and mentions, and disable allowed mentions.

**Why:** The user wants logs to show what AutoMod removed without claiming a failed deletion succeeded or triggering mentions. Native blocked messages may never enter ordinary message handling.

**How to apply:** Keep ignored/protected target checks. Use Message.content only after successful deletion, and execution.content only for the verified managed BlockMessage event.