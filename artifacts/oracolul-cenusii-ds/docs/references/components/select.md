---
name: select
description: Source-backed build contract for the select component family.
---

# select

- **Provenance:** existing workspace app Oracolul Cenușii — Status.
- **Implementation:** artifacts/status/src/components/ui/select.tsx.
- **Public exports:** Select, SelectGroup, SelectValue, SelectTrigger, SelectContent, SelectLabel, SelectItem, SelectSeparator, SelectScrollUpButton, SelectScrollDownButton.
- **License:** no root LICENSE file was found at extraction time; source-module headers contain no license declaration. Do not redistribute externally until verified.
- **Runtime dependencies:** react, @radix-ui/react-select, lucide-react, @/lib/utils.
- **Usage evidence:** 12 distinct TSX consumer file(s) import this family; counted by source module import path.
- **Chunk:** Pilot; initial status implemented.

## Build constraints

Port the source implementation and keep its public props, variants, keyboard/focus behavior, and accessible state semantics. Change only the source alias @/lib/utils to this package's #lib/utils import and use the generated token CSS as its theme. Preserve source class lists and supported dependencies. Representative consumer examples are in artifacts/status/src; inspect them when implementing this family.

## Pilot implementation

The design-system module is copied from the source file with only the utility import rewritten. It keeps Radix Select for its portal, keyboard navigation, selection state, and accessible announcements, along with the source's trigger, item, group, and popper styling.

Representative consumers: `pages/moderation/AutoMod.tsx`, `pages/moderation/VerificationAdmin.tsx`, and `pages/moderation/AntiRaid.tsx`.
