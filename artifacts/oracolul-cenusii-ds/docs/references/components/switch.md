---
name: switch
description: Source-backed build contract for the switch component family.
---

# switch

- **Provenance:** existing workspace app Oracolul Cenușii — Status.
- **Implementation:** artifacts/status/src/components/ui/switch.tsx.
- **Public exports:** Switch.
- **License:** no root LICENSE file was found at extraction time; source-module headers contain no license declaration. Do not redistribute externally until verified.
- **Runtime dependencies:** react, @radix-ui/react-switch, @/lib/utils.
- **Usage evidence:** 7 distinct TSX consumer file(s) import this family; counted by source module import path.
- **Chunk:** Pilot; initial status implemented.

## Build constraints

Port the source implementation and keep its public props, variants, keyboard/focus behavior, and accessible state semantics. Change only the source alias @/lib/utils to this package's #lib/utils import and use the generated token CSS as its theme. Preserve source class lists and supported dependencies. Representative consumer examples are in artifacts/status/src; inspect them when implementing this family.

## Pilot implementation

The design-system module is copied from the source file with only the utility import rewritten. It keeps Radix Switch state and keyboard behavior, checked/unchecked styling, focus visibility, and disabled semantics.

Representative consumers: `pages/moderation/Protection.tsx`, `pages/moderation/AutoMod.tsx`, and `pages/moderation/AntiRaid.tsx`.
