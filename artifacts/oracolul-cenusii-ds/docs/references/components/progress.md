---
name: progress
description: Source-backed build contract for the progress component family.
---

# progress

- **Provenance:** existing workspace app Oracolul Cenușii — Status.
- **Implementation:** artifacts/status/src/components/ui/progress.tsx.
- **Public exports:** Progress.
- **License:** no root LICENSE file was found at extraction time; source-module headers contain no license declaration. Do not redistribute externally until verified.
- **Runtime dependencies:** react, @radix-ui/react-progress, @/lib/utils.
- **Usage evidence:** 0 distinct TSX consumer file(s) import this family; counted by source module import path.
- **Chunk:** Chunk 9; initial status pending.

## Build constraints

Port the source implementation and keep its public props, variants, keyboard/focus behavior, and accessible state semantics. Change only the source alias @/lib/utils to this package's #lib/utils import and use the generated token CSS as its theme. Preserve source class lists and supported dependencies. Representative consumer examples are in artifacts/status/src; inspect them when implementing this family.
