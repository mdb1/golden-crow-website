# GC Fitness Coach Portal — redesign backlog

Living backlog for the 2026-06 redesign on branch
`feat/gc-fitness-backoffice-redesign`. Captures all feedback so nothing is lost.
Status: ☐ todo · ◐ in progress · ☑ done. Companion to
`docs/gc-fitness-redesign.md` (design system).

## Done (committed)
- ☑ Foundation: tokens (light+dark), shell, primitives, Biblioteca consolidation.
- ☑ Hero screens + secondary routes restyle.
- ☑ Sidebar: solid-gold active pill, bigger font, grouped nav, Golden Crow logo.
- ☑ Agenda client selector → design system + avatars.
- ☑ Client photos in pickers.
- ☑ Loading skeletons + skeleton→loaded fade-in (A8).
- ☑ i18n: Spanish-first default + redesign hero literals through catalog.

## A. Quick visual / UX fixes — ALL DONE
- ☑ **A1** Dashboard recent-activity: removed shifting % numbers.
- ☑ **A2** Dashboard: Schedule CTA added.
- ☑ **A3** Client names link to profile (dashboard, recent-logs, my-activity).
- ☑ **A4** Clients filter → explicit "Necesitan atención (N)" toggle.
- ☑ **A5** Client detail: removed duplicated name (email echo).
- ☑ **A6** Chat: full-bleed, no rounded card/padding.
- ☑ **A7** Settings: clear Claro/Oscuro segmented theme control; settings i18n.
- ☑ **A8** Skeleton→loaded fade-in.

## B. Biblioteca restructure
- ☑ **B1** Workouts → vertical list.
- ☑ **B2** Habits Library: habit thumbnail + dropped Reminder column.
- ☑ **B3** Habits Assignments: vertical list grouped by habit title.
- ☑ **B4** New Exercise → modal over library (workout creator stays a route).
- ☑ **B5** Hide/unhide GLOBAL habits per-trainer via `habit_template_hidden/{uid}`
  (owner-scoped rule + rules test, gate green); "Ocultar de mi biblioteca" +
  "Mostrar ocultos / Restaurar". Rule lives in the gc-fitness repo on branch
  `feat/habit-template-hidden-rule` (needs deploy/PR there).
- ☑ **B6** Habit delete confirm shows assignment impact (informational; truthful
  that soft-delete does NOT cascade).

## C. Client-detail features
- ☑ **C1** "Pedidos al cliente": fulfilled/pending note (uploaded after request).
- ☑ **C2** Body-weight "Último" by most-recent measurement DATE, not last-created.
- ☑ **C3** Body-weight chart timeline range selector (All/90d/30d/7d).
- ☑ **C4** NEW route + CTA: per-client per-exercise **progress charts** (e.g.
  flat-bench weight over time), mirroring the iOS app. Route
  `clients/[id]/progress`: exercise picker (derived from the client's logged
  history), metric toggle (top-set weight / est. 1RM Epley / volume), and the
  shared All/90d/30d/7d range selector over a gold AreaChart. Server aggregates
  ONE bounded read (`workout_logs where clientId==X and startedAt>=today-365
  orderBy startedAt desc limit 300`, reusing the existing clientId+startedAt
  index) into lightweight per-session points in
  `lib/gc-fitness/exercise-progress-actions.ts`. CTA "Ver progreso por
  ejercicio" added to `ClientHeader`.

## D. i18n — deep forms (pre-existing debt)
- ☑ **D1** Exercise/habit forms were already catalog-driven (the English seen was
  the en locale). Routed the last English-only wrappers (New Exercise route +
  modal). Catalogs synced (1376 keys each). Remaining: 4 Spanish-inline schedule
  dialogs would still show Spanish if the portal is switched to English — optional
  en-symmetry polish, not a Spanish-portal bug.

## E. Polish (this round)
- ☑ Light-theme contrast: muted text #8a93a3 (~3:1) → #5d6675 (~4.9:1), darker
  sidebar/eyebrow/border, nav group labels /50→/70. Token-level, all screens.
- ☑ Mobile usability pass (iPhone web ~390px): no horizontal page overflow,
  grids→1col, tables/PillTabs scroll in-box, agenda toolbar wraps + grid scrolls,
  dialogs/modals fit, rows wrap (time+actions to 2nd line), tap targets ≥44px.

## Notes / constraints
- Tokens only (both themes). Preserve all data/logic/server-actions. Spanish-first.
- Test gate before push: backoffice `npx jest` (1 known locale flake — see
  memory), `next build`, `tsc`. B5 additionally needs the firestore-rules
  emulator gate (JDK 21).
