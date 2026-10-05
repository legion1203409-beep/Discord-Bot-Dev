---
name: Image retouch dimensions
description: Preserve source composition when AI image editing changes the output aspect ratio.
---

Check the actual dimensions of both source and edited images. AI retouching can return a square composition despite a landscape source and an explicit request to preserve its aspect ratio.

**Why:** A local XP-bar removal returned a square image with rearranged title and dragon artwork.

**How to apply:** For precise localized changes, composite only the retouched region into the original composition; do not replace or stretch the whole image blindly.
