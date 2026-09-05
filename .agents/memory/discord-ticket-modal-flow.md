---
name: Discord ticket modal flow
description: Why staff applications use two ordered modal pages and lock their public contract button.
---

Staff applications use a public contract button that opens a five-field first modal page. After it is submitted, a continuation button opens the second page containing the final three fields.

**Why:** Discord modals allow at most five text-input rows, so all eight staff questions cannot be displayed in one native modal. Two fixed pages show every answer field without letting users choose or skip questions.

**How to apply:** “Deschide contractul” opens questions 1–5 together; after submission, “Continuă aplicația” opens questions 6–8 together. The public contract explains the two-page flow without duplicating the question list. Staff asks name without timezone and ends with tag acceptance; a clear refusal posts automatic rejection.
On bot reconnect, active ticket panels are refreshed without overwriting completed or rejected contracts.
When the second staff page is submitted, the first response message is edited into one complete embed and its continuation button is removed.
After completion or rejection, replace the public start button with a disabled status button so the contract cannot be restarted in the same ticket.