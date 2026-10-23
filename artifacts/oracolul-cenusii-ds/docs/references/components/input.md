---
name: input
description: Source-backed build contract for the input component family.
---

# input

- **Provenance:** existing workspace app Oracolul Cenușii — Status.
- **Implementation:** artifacts/status/src/components/ui/input.tsx.
- **Public exports:** Input.
- **License:** no root LICENSE file was found at extraction time; source-module headers contain no license declaration. Do not redistribute externally until verified.
- **Runtime dependencies:** react, @/lib/utils.
- **Usage evidence:** 15 distinct TSX consumer file(s) import this family; counted by source module import path.
- **Chunk:** Pilot; initial status implemented.

## Build constraints

Port the source implementation and keep its public props, variants, keyboard/focus behavior, and accessible state semantics. Change only the source alias @/lib/utils to this package's #lib/utils import and use the generated token CSS as its theme. Preserve source class lists and supported dependencies. Representative consumer examples are in artifacts/status/src; inspect them when implementing this family.

## Pilot implementation

The design-system module is copied from the source file with only the utility import rewritten. It preserves the native input props/ref, configurable input type, source placeholder/focus/disabled styles, and sizing behavior.

Representative consumers: `pages/moderation/VerificationAdmin.tsx`, `pages/moderation/Commands.tsx`, and `pages/moderation/ServerSetup.tsx`.
