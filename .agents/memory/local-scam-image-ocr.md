---
name: Local scam image OCR
description: Privacy and evidence constraints for image-only Anti-Scam moderation.
---

Keep OCR of member-posted images local to the bot. Do not send image pixels to external AI services without asking the user to change this decision. Failed, unsupported, or unreadable OCR must not trigger a sanction; when OCR does establish a violation, use the Anti-Scam action the server already configured.

**Why:** The user approved local processing to avoid sharing members' images with an additional service. The motivating crypto giveaway collage has tiny, imperfectly recognized text, so isolated words are not reliable evidence of a scam.

**How to apply:** When extending image moderation, preserve the privacy boundary and resource limits, and require corroborating signals rather than a lone OCR token. An external visual classifier would be a product/privacy change requiring user approval.