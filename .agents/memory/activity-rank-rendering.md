---
name: Activity rank rendering
description: Performance constraints for preserving the supplied animated rank-bar artwork.
---

The renderer can capture frames directly from the supplied artwork generators instead of encoding and reopening a temporary GIF. This preserves the generator's frames while avoiding redundant encoding work.

**Why:** Production has experienced intermittent render timeouts that were not reproducible with local default-banner benchmarks.

**How to apply:** The direct capture temporarily intercepts Pillow's process-global `Image.Image.save`. Keep it scoped and restore it in `finally`; this is safe because the Node renderer starts one isolated Python process per card. If rendering becomes a persistent or concurrent Python worker, replace this interception with a concurrency-safe frame API.
