---
name: AI moderation reasoning budget
description: Why an apparently successful GPT classifier request can produce no moderation result.
---

Treat an empty AI moderation completion as an incomplete classification, even when the API call itself succeeds. Keep automated enforcement fail-closed.

**Why:** A real gpt-5-mini Chat Completions request with a small output-token cap used every completion token for hidden reasoning and returned `finish_reason: "length"` with empty message content. The caller silently discarded it, so an enabled moderation module appeared inactive. Minimal reasoning effort with JSON output and a sufficient token budget returned a complete classification.

**How to apply:** When changing the moderation model or request settings, inspect both completion content and finish reason with a benign synthetic message before claiming it works. Never sanction based on truncated, malformed, or unapproved-category output; surface operational failures without logging message contents or credentials.