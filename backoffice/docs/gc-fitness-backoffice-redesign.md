# GC Fitness Backoffice Redesign - Foundation

Date: 2026-05-26
Branch: `feat/gc-fitness-backoffice-redesign`

## Component Library Decision

Chosen: **shadcn/ui**

Why:
- Already integrated in this repo (`shadcn/tailwind.css`, existing `src/components/ui/*`).
- Components are local source code (not opaque package widgets), so we can adapt UX quickly per flow.
- Lowest migration risk and fastest rollout across existing gc-fitness routes.
- Tailwind + radix primitives keep runtime light (CSS-driven styling, no mandatory runtime style engine layer).

Alternatives reviewed:
- **Chakra UI**: strong DX, but introducing it now means parallel design systems and larger migration overhead.
- **daisyUI**: fast semantic classes, but less control/flexibility for the custom product language we need in GC Fitness.

## Theme Palette (App-aligned)

We keep tokenized theme variables in `src/app/globals.css` with both modes:
- Primary (light): `#007AFF`
- Primary (dark): `#7EB5FF`
- Background light: `#FFFFFF`
- Background dark: `#090C12`
- Muted/card/border values adjusted for iOS-like contrast.

Ambient gradients use:
- blue glow (top-left)
- rose glow (top-right)
- green glow (bottom)

This aligns with the app's visual tone while keeping readability for data-heavy admin surfaces.

## What was changed in this commit group

- Added gc-fitness theme toggle component:
  - `src/components/gc-fitness/gc-fitness-appearance-toggle.tsx`
- Integrated theme toggle in shell header:
  - `src/components/gc-fitness/gc-fitness-shell.tsx`
- Added global shell ambient background class:
  - `src/app/globals.css` (`.gc-shell-bg`)
- Migrated admin page to shadcn-based structure (cards/tables/inputs/buttons):
  - `src/app/gc-fitness/admin/page.tsx`

## Next steps

1. Apply same shadcn structure pass to `clients`, `chat`, `schedule`, `templates`, `habits`, `settings`.
2. Normalize feedback states across actions (loading/success/error toasts + inline states).
3. Mobile-first cleanup for dense tables (stacked cards + horizontal sections only where needed).
