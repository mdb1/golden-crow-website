# GC Fitness — Coach Portal redesign (2026-06)

Design system + conventions for the `/gc-fitness` backoffice restyle. Read this
before touching any page under `src/app/gc-fitness/**`.

## Look & feel

Reference: the screenshots in `gc-fitness/redesign/`. Goals: **larger fonts,
rounder corners, softer surfaces, easier to scan, great on web + mobile.**

- **Light = reference theme.** White sidebar + white cards float on a soft
  light-grey canvas (`--background`). Dark theme is polished to parity — do not
  hardcode colors; always use the CSS variable tokens so both themes work.
- **Accent:** mustard gold (`--primary`). Primary CTAs are gold; the active
  sidebar item and active pill-tab are a solid gold pill.
- **Ink:** deep navy (`--foreground`). Muted grey for secondary text
  (`--muted-foreground`).
- **Corners:** cards are `rounded-[1.25rem]` (token override already applied to
  `[data-slot=card]`). Hero CTA buttons opt into `rounded-full`.
- **Shadows:** subtle. Cards already carry a soft ring + `shadow-sm`.

## Tokens (set in `globals.css`, scoped to `.gc-fitness-theme`)

Never use raw hex. Use Tailwind classes that map to tokens:
`bg-background bg-card bg-muted text-foreground text-muted-foreground
border-border bg-primary text-primary-foreground ring-foreground/…`.

Badges use semantic variants (see `components/ui/badge.tsx`):
`brand` (blue), `success` (green), `warning` (amber), `rose`, `violet` (NEW),
`secondary`, `outline`, `destructive`. Map content like:
- Plan tags: Premium → `brand`, Elite → `violet`, Standard → `secondary`.
- Difficulty: Principiante → `success`, Intermedio → `brand`, Avanzado → `violet`.
- Categories/areas: pick from brand/violet/success/warning sensibly.

## Shared primitives (import these — don't re-roll)

- `PageHeader` — `components/gc-fitness/page-header.tsx`. The big title block at
  the top of every page: `<PageHeader title="Clientes" subtitle="6 clientes
  activos" actions={<Button className="rounded-full">…</Button>} />`.
  Server-safe.
- `StatCard` — `components/gc-fitness/stat-card.tsx`. Dashboard KPI tile with
  icon chip, trend delta, big value, label. Server-safe.
- `PillTabs` — `components/gc-fitness/pill-tabs.tsx` (client). Rounded segmented
  control for route tabs (`href`) or in-page filters (`onSelect`). Pass
  `activeKey`.
- `Card`/`CardHeader`/`CardContent` — shadcn, already restyled via tokens.
- `ClientAvatar` — `components/gc-fitness/ClientAvatar.tsx`. Initials/photo.

## Page skeleton

```tsx
export default async function SomePage() {
  return (
    <div className="gc-page flex flex-col gap-6">
      <PageHeader title="…" subtitle="…" actions={…} />
      {/* sections of <Card>s, grids: grid gap-4 sm:grid-cols-2 lg:grid-cols-4 */}
    </div>
  );
}
```

`.gc-page` (in globals.css) handles max-width + responsive padding. The shell
renders NO desktop top bar — the page's `PageHeader` is the title. A slim
mobile-only header (hamburger) is provided by the shell.

## Responsive rules (web + mobile — both matter)

- Grids collapse to 1 column on mobile: `grid gap-4 sm:grid-cols-2 lg:grid-cols-4`.
- Card lists become single column; tables get `overflow-x-auto` wrappers.
- Tap targets ≥ 40px. Don't rely on hover-only affordances on mobile.
- The calendar/agenda grid scrolls horizontally on small screens.

## Do / Don't

- DO keep ALL existing functionality, data wiring, server actions, and i18n
  keys. This is a restyle, not a rewrite of behavior.
- DO use existing message catalog keys (`messages/en.json`, `messages/es.json`).
  Add keys when you add copy; mirror EN + ES.
- DON'T change Firestore queries, auth, or business logic.
- DON'T introduce new dependencies.
- DON'T hardcode light/dark colors — tokens only.

## Nav / IA change

Workouts + Exercises + Habits are consolidated under one **Biblioteca**
(`/gc-fitness/library`) with `PillTabs`. The old routes still exist and stay
linked from the tabs; the sidebar "Biblioteca" item stays active across all of
them (handled in `gc-fitness-shell.tsx`).
