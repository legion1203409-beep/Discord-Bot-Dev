---
name: Daily report coverage
description: Distinguish days before the bot joined a guild from real zero-activity days in Discord statistics.
---

Never interpret an all-zero daily-stats row as proof that the server had zero activity. A report publication can create that row even when the bot had no observations. Use the bot's guild join date in the report timezone as a coverage boundary; mark earlier chart days unavailable rather than zero, and label the join day as partial. Even after joining, no observed events cannot distinguish a quiet day from interrupted collection.

**Why:** A newly added guild received a previous-day report full of zeros while current-day messages were already being counted. The old report appeared authoritative despite the bot not having historical observations.

**How to apply:** Guard publication and correction against both the join date and whether any metrics were actually recorded. Do not invent historical totals from absent rows; recovering activity from Discord history would be a separate, explicitly bounded backfill operation.