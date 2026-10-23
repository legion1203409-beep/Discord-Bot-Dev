# Oracolul Cenușii — Status component inventory

Source: existing workspace artifact artifacts/status; component implementations in src/components/ui. The component family set is the source's 55 exported modules. Source styles use Tailwind utilities backed by the shared theme in src/index.css. No root LICENSE file was found during extraction; component licensing should be verified before external redistribution.

Usage importance is the number of distinct TSX consumer files importing the family under src/components/ui. Modules with no consumers are still included because they ship in the source component set. Chunk order is descending usage, then alphabetical. Pilot = first five; later chunks contain up to five families each.

| Family | Build reference | Dependencies | Consumer files | Chunk | Status |
|---|---|---|---:|---|---|
| button | docs/references/components/button.md | react, @radix-ui/react-slot, class-variance-authority, @/lib/utils | 23 | Pilot | implemented |
| input | docs/references/components/input.md | react, @/lib/utils | 15 | Pilot | implemented |
| select | docs/references/components/select.md | react, @radix-ui/react-select, lucide-react, @/lib/utils | 12 | Pilot | implemented |
| textarea | docs/references/components/textarea.md | react, @/lib/utils | 10 | Pilot | implemented |
| switch | docs/references/components/switch.md | react, @radix-ui/react-switch, @/lib/utils | 7 | Pilot | implemented |
| dialog | docs/references/components/dialog.md | react, @radix-ui/react-dialog, lucide-react, @/lib/utils | 5 | Chunk 2 | pending |
| form | docs/references/components/form.md | react, @radix-ui/react-label, @radix-ui/react-slot, react-hook-form, @/lib/utils, @/components/ui/label | 3 | Chunk 2 | pending |
| checkbox | docs/references/components/checkbox.md | react, @radix-ui/react-checkbox, lucide-react, @/lib/utils | 2 | Chunk 2 | pending |
| toast | docs/references/components/toast.md | react, @radix-ui/react-toast, class-variance-authority, lucide-react, @/lib/utils | 2 | Chunk 2 | pending |
| accordion | docs/references/components/accordion.md | react, @radix-ui/react-accordion, lucide-react, @/lib/utils | 1 | Chunk 2 | pending |
| alert-dialog | docs/references/components/alert-dialog.md | react, @radix-ui/react-alert-dialog, @/lib/utils, @/components/ui/button | 1 | Chunk 3 | pending |
| card | docs/references/components/card.md | react, @/lib/utils | 1 | Chunk 3 | pending |
| popover | docs/references/components/popover.md | react, @radix-ui/react-popover, @/lib/utils | 1 | Chunk 3 | pending |
| radio-group | docs/references/components/radio-group.md | react, @radix-ui/react-radio-group, lucide-react, @/lib/utils | 1 | Chunk 3 | pending |
| slider | docs/references/components/slider.md | react, @radix-ui/react-slider, @/lib/utils | 1 | Chunk 3 | pending |
| tabs | docs/references/components/tabs.md | react, @radix-ui/react-tabs, @/lib/utils | 1 | Chunk 4 | pending |
| toaster | docs/references/components/toaster.md | @/hooks/use-toast, @/components/ui/toast | 1 | Chunk 4 | pending |
| alert | docs/references/components/alert.md | react, class-variance-authority, @/lib/utils | 0 | Chunk 4 | pending |
| aspect-ratio | docs/references/components/aspect-ratio.md | @radix-ui/react-aspect-ratio | 0 | Chunk 4 | pending |
| avatar | docs/references/components/avatar.md | react, @radix-ui/react-avatar, @/lib/utils | 0 | Chunk 4 | pending |
| badge | docs/references/components/badge.md | react, class-variance-authority, @/lib/utils | 0 | Chunk 5 | pending |
| breadcrumb | docs/references/components/breadcrumb.md | react, @radix-ui/react-slot, lucide-react, @/lib/utils | 0 | Chunk 5 | pending |
| button-group | docs/references/components/button-group.md | @radix-ui/react-slot, class-variance-authority, @/lib/utils, @/components/ui/separator | 0 | Chunk 5 | pending |
| calendar | docs/references/components/calendar.md | react, lucide-react, react-day-picker, @/lib/utils, @/components/ui/button | 0 | Chunk 5 | pending |
| carousel | docs/references/components/carousel.md | react, embla-carousel-react, lucide-react, @/lib/utils, @/components/ui/button | 0 | Chunk 5 | pending |
| chart | docs/references/components/chart.md | react, recharts, @/lib/utils | 0 | Chunk 6 | pending |
| collapsible | docs/references/components/collapsible.md | @radix-ui/react-collapsible | 0 | Chunk 6 | pending |
| command | docs/references/components/command.md | react, @radix-ui/react-dialog, cmdk, lucide-react, @/lib/utils, @/components/ui/dialog | 0 | Chunk 6 | pending |
| context-menu | docs/references/components/context-menu.md | react, @radix-ui/react-context-menu, lucide-react, @/lib/utils | 0 | Chunk 6 | pending |
| drawer | docs/references/components/drawer.md | react, vaul, @/lib/utils | 0 | Chunk 6 | pending |
| dropdown-menu | docs/references/components/dropdown-menu.md | react, @radix-ui/react-dropdown-menu, lucide-react, @/lib/utils | 0 | Chunk 7 | pending |
| empty | docs/references/components/empty.md | class-variance-authority, @/lib/utils | 0 | Chunk 7 | pending |
| field | docs/references/components/field.md | react, class-variance-authority, @/lib/utils, @/components/ui/label, @/components/ui/separator | 0 | Chunk 7 | pending |
| hover-card | docs/references/components/hover-card.md | react, @radix-ui/react-hover-card, @/lib/utils | 0 | Chunk 7 | pending |
| input-group | docs/references/components/input-group.md | react, class-variance-authority, @/lib/utils, @/components/ui/button, @/components/ui/input, @/components/ui/textarea | 0 | Chunk 7 | pending |
| input-otp | docs/references/components/input-otp.md | react, input-otp, lucide-react, @/lib/utils | 0 | Chunk 8 | pending |
| item | docs/references/components/item.md | react, @radix-ui/react-slot, class-variance-authority, @/lib/utils, @/components/ui/separator | 0 | Chunk 8 | pending |
| kbd | docs/references/components/kbd.md | @/lib/utils | 0 | Chunk 8 | pending |
| label | docs/references/components/label.md | react, @radix-ui/react-label, class-variance-authority, @/lib/utils | 0 | Chunk 8 | pending |
| menubar | docs/references/components/menubar.md | react, @radix-ui/react-menubar, lucide-react, @/lib/utils | 0 | Chunk 8 | pending |
| navigation-menu | docs/references/components/navigation-menu.md | react, @radix-ui/react-navigation-menu, class-variance-authority, lucide-react, @/lib/utils | 0 | Chunk 9 | pending |
| pagination | docs/references/components/pagination.md | react, lucide-react, @/lib/utils, @/components/ui/button | 0 | Chunk 9 | pending |
| progress | docs/references/components/progress.md | react, @radix-ui/react-progress, @/lib/utils | 0 | Chunk 9 | pending |
| resizable | docs/references/components/resizable.md | lucide-react, react-resizable-panels, @/lib/utils | 0 | Chunk 9 | pending |
| scroll-area | docs/references/components/scroll-area.md | react, @radix-ui/react-scroll-area, @/lib/utils | 0 | Chunk 9 | pending |
| separator | docs/references/components/separator.md | react, @radix-ui/react-separator, @/lib/utils | 0 | Chunk 10 | pending |
| sheet | docs/references/components/sheet.md | react, @radix-ui/react-dialog, class-variance-authority, lucide-react, @/lib/utils | 0 | Chunk 10 | pending |
| sidebar | docs/references/components/sidebar.md | react, @radix-ui/react-slot, class-variance-authority, lucide-react, @/hooks/use-mobile, @/lib/utils, @/components/ui/button, @/components/ui/input, @/components/ui/separator, @/components/ui/sheet, @/components/ui/skeleton, @/components/ui/tooltip | 0 | Chunk 10 | pending |
| skeleton | docs/references/components/skeleton.md | @/lib/utils | 0 | Chunk 10 | pending |
| sonner | docs/references/components/sonner.md | next-themes, sonner | 0 | Chunk 10 | pending |
| spinner | docs/references/components/spinner.md | lucide-react, @/lib/utils | 0 | Chunk 11 | pending |
| table | docs/references/components/table.md | react, @/lib/utils | 0 | Chunk 11 | pending |
| toggle | docs/references/components/toggle.md | react, @radix-ui/react-toggle, class-variance-authority, @/lib/utils | 0 | Chunk 11 | pending |
| toggle-group | docs/references/components/toggle-group.md | react, @radix-ui/react-toggle-group, class-variance-authority, @/lib/utils, @/components/ui/toggle | 0 | Chunk 11 | pending |
| tooltip | docs/references/components/tooltip.md | react, @radix-ui/react-tooltip, @/lib/utils | 0 | Chunk 11 | pending |

## Chunk order

- Pilot: button, input, select, textarea, switch
- Chunk 2: dialog, form, checkbox, toast, accordion
- Chunk 3: alert-dialog, card, popover, radio-group, slider
- Chunk 4: tabs, toaster, alert, aspect-ratio, avatar
- Chunk 5: badge, breadcrumb, button-group, calendar, carousel
- Chunk 6: chart, collapsible, command, context-menu, drawer
- Chunk 7: dropdown-menu, empty, field, hover-card, input-group
- Chunk 8: input-otp, item, kbd, label, menubar
- Chunk 9: navigation-menu, pagination, progress, resizable, scroll-area
- Chunk 10: separator, sheet, sidebar, skeleton, sonner
- Chunk 11: spinner, table, toggle, toggle-group, tooltip
