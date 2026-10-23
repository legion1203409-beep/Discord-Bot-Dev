---
name: input-group
description: Source-backed build contract for the input-group component family.
---

# input-group

- **Provenance:** existing workspace app Oracolul Cenușii — Status.
- **Implementation:** artifacts/status/src/components/ui/input-group.tsx.
- **Public exports:** InputGroup, InputGroupAddon, InputGroupButton, InputGroupText, InputGroupInput, InputGroupTextarea.
- **License:** no root LICENSE file was found at extraction time; source-module headers contain no license declaration. Do not redistribute externally until verified.
- **Runtime dependencies:** react, class-variance-authority, @/lib/utils, @/components/ui/button, @/components/ui/input, @/components/ui/textarea.
- **Usage evidence:** 0 distinct TSX consumer file(s) import this family; counted by source module import path.
- **Chunk:** Chunk 7; initial status pending.

## Build constraints

Port the source implementation and keep its public props, variants, keyboard/focus behavior, and accessible state semantics. Change only the source alias @/lib/utils to this package's #lib/utils import and use the generated token CSS as its theme. Preserve source class lists and supported dependencies. Representative consumer examples are in artifacts/status/src; inspect them when implementing this family.
