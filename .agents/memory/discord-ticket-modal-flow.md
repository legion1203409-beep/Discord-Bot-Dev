---
name: Discord ticket menu flow
description: Why ticket applications use ordered answer modals and lock their public contract button.
---

Ticket applications use a public contract button that opens question 1 directly. Each submitted answer returns a private “next question” button until the sequence is complete.

**Why:** Discord modals allow at most five text-input rows, and users must not choose or skip questions. One-question modals with explicit progression preserve the full form in order.

**How to apply:** “Deschide contractul” opens step 1; the staff contract also lists all eight questions before answering, and each answer exposes only the next step. Staff asks name without timezone and ends at step 8 with tag acceptance; a clear refusal posts automatic rejection.
After completion or rejection, replace the public start button with a disabled status button so the contract cannot be restarted in the same ticket.