---
name: Discord mobile embed layout
description: Why compact multiline values work better than desktop-style inline fields and block charts in Discord reports.
---

Use a small number of embed fields with compact multiline values for mobile-facing reports. Avoid fixed-width Unicode or code-block bar charts; use plain dates, counts, and ranked lists. Keep the web preview shaped like the mobile Discord result.

**Why:** On Android Discord, six inline metric fields stacked as separate name/value pairs and consumed most of the screen. The Unicode bars in code fences rendered as large white blocks. A desktop-style preview did not reveal either problem.

**How to apply:** When designing or changing Discord reports, group related metrics into field values, leave field names as plain text, and check narrow-screen wrapping. Keep each field value within Discord's 1024-character limit.

Do not render the same full reason in both an embed's description and its detailed field. If the description template includes `{reason}`, keep the detail in the description and omit the duplicate field.

**Why:** Detailed moderation notifications duplicated message-deletion context and made the embed unnecessarily tall.

**How to apply:** Check whether the configured description template interpolates `{reason}` before adding a separate details field.

For member entry and exit logs, use Discord timestamp tokens for localized full dates and relative times, and persist entry times while member logging is enabled so departure duration survives bot restarts.

**Why:** Raw server timestamps do not adapt to each moderator's timezone, and process-only state loses the entry date on restart.

**How to apply:** Show the member's display name, username, entry/exit times, account creation date, and calculated stay duration in compact, stacked fields.