---
name: button
description: Source-backed build contract for the button component family.
---

# button

- **Provenance:** existing workspace app Oracolul Cenușii — Status.
- **Implementation:** artifacts/status/src/components/ui/button.tsx.
- **Public exports:** Button, buttonVariants.
- **License:** no root LICENSE file was found at extraction time; source-module headers contain no license declaration. Do not redistribute externally until verified.
- **Runtime dependencies:** react, @radix-ui/react-slot, class-variance-authority, @/lib/utils.
- **Usage evidence:** 23 distinct TSX consumer file(s) import this family; counted by source module import path.
- **Chunk:** Pilot; initial status implemented.

## Build constraints

Port the source implementation and keep its public props, variants, keyboard/focus behavior, and accessible state semantics. Change only the source alias @/lib/utils to this package's #lib/utils import and use the generated token CSS as its theme. Preserve source class lists and supported dependencies. Representative consumer examples are in artifacts/status/src; inspect them when implementing this family.

## Pilot implementation

The design-system module is copied from the source file with only the utility import rewritten. It preserves the source variants (`default`, `destructive`, `outline`, `secondary`, `ghost`, `link`), sizes (`default`, `sm`, `lg`, `icon`), `asChild` behavior, and source focus/disabled/active classes.

Representative consumers: `pages/moderation/Dashboard.tsx`, `pages/moderation/Protection.tsx`, and `pages/moderation/ServerSetup.tsx`.
