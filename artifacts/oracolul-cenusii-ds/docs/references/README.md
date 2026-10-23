# Source references

This design system is extracted from the existing workspace artifact
`artifacts/status`.

| Subject | Kind | Source | Extracted |
|---|---|---|---|
| Shared palette and typography | code-source | `artifacts/status/src/index.css` | Ash/night surfaces, ember and gold brand colors, semantic green/blue/red, DM Sans body, Cormorant Garamond display, DM Mono labels, 4 px spacing step |
| Public verification surface | code-source | `artifacts/status/src/pages/public/verification-page.css` | Related ember-and-gold treatment; not used to override the shared Status palette |
| Component library | code-source | `artifacts/status/src/components/ui/` | Source-backed family inventory, per-family contracts, usage ranking, and chunk plan in `component-inventory.md` |
| Brand treatment | code-source | `artifacts/status/src/index.css` | Text wordmark treatment; no standalone logo file was found |

The source defines a dark visual theme. The dark token set is source-mapped;
the light set is derived for consumers that require a light theme. Do not treat
the derived palette as a second source-defined theme.
