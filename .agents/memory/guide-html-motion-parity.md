---
name: HTML reference motion parity
description: Port motion from supplied HTML into live app pages while retaining real application state.
---

When the user supplies HTML for a redesign, preserve its visible animations and interaction cues, not only the static layout. Keep real application data and behavior; do not copy demo values or the reference runtime.

**Why:** The user repeatedly clarified that the source animations were part of the requested redesign.

**How to apply:** Inventory the reference’s visible motion classes and map each to a real element in the app before considering the port complete.

For live verification flows, do not copy reference-demo auto-nudges that change the slider value. Keep progress user-controlled and represent the idle cue with a glow or flame pulse instead.

**Why:** A programmed slider movement could mislead users about a real, one-use Discord ticket.

**How to apply:** Keep demo-only progress and submission behavior out of `/verificare`; connect sparks, completion, and success effects to the real UI state.
