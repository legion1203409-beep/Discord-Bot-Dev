---
name: Discord ticket menu flow
description: Why ticket applications use a dropdown with one answer modal per question.
---

Ticket applications should keep all approved questions, but present them as a dropdown menu with one answer modal per selected question. The staff menu contains all seven questions; partnership and help/report menus contain their own fields.

**Why:** Discord modals allow at most five text-input rows, and the user prefers a simple question menu instead of a large multi-field form. One-question modals preserve the complete form while keeping each interaction focused.

**How to apply:** Keep the dropdown as the primary ticket control. Each selection should open a focused answer modal and post a styled answer embed. Keep the server tag as a mandatory warning, not as an additional form question.