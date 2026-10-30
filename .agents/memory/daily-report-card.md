---
name: Daily report card
description: How the daily statistics post draws its image, and what it falls back to.
---

The daily report attaches a PNG drawn by `bot/daily-report/render.py` (Pillow, one Python process per report, one at a time with a short queue) and points the embed image at `attachment://raport-zilnic.png`. The card is 800 px wide with text of at least 20 px, so it stays readable at the ~400 px Discord gives embed images on phones.

**Why:** The mobile layout note rules out inline field grids and Unicode or code-block bars in the embed text; a drawn picture is the only way to show the week as bars without breaking that.

**How to apply:** The DejaVu font has no emoji, so every text sent to the script goes through `chartText` first. If the card is turned off (`dailyStats.chart: false`) or cannot be drawn, the report still goes out with the custom image, as before; never let a drawing failure stop the post. `build.mjs` copies the script and the font into `dist/daily-report/`. The change since the day before is shown only when the bot watched all of that day (not before or on its join day), per the coverage note.
