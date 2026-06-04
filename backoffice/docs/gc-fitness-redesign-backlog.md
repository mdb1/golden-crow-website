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
- ☐ **B5** Hide/delete habits from the standard (GLOBAL) library. NOT a per-doc
  `deleted` flip (globals are shared across all trainers). Needs a **per-trainer
  hidden-set** (`habit_template_hidden/{trainerUid}` doc or subcollection) that
  `listHabitTemplates` filters out + an unhide affordance + a NEW owner-scoped
  firestore rule + a matching `firestore-tests` suite (happy + spoofed-owner
  deny) per the mandatory rules gate.
- ☑ **B6** Habit delete confirm shows assignment impact (informational; truthful
  that soft-delete does NOT cascade).

## C. Client-detail features
- ☑ **C1** "Pedidos al cliente": fulfilled/pending note (uploaded after request).
- ☑ **C2** Body-weight "Último" by most-recent measurement DATE, not last-created.
- ☑ **C3** Body-weight chart timeline range selector (All/90d/30d/7d).
- ☐ **C4** NEW route + CTA: per-client per-exercise **progress charts** (e.g.
  flat-bench weight over time), mirroring the iOS app. Needs: investigate how
  workout logs store per-exercise set weights, an aggregation query (read-cost
  aware), a chart route under `clients/[id]/...`, an exercise picker, and a CTA
  from the client detail.

## D. i18n — deep forms (pre-existing debt)
- ☐ **D1** Deep forms/dialogs still English-only (exercise/habit forms, schedule
  dialogs, habit detail). Route through the catalog (es-first), incrementally.

## Notes / constraints
- Tokens only (both themes). Preserve all data/logic/server-actions. Spanish-first.
- Test gate before push: backoffice `npx jest` (1 known locale flake — see
  memory), `next build`, `tsc`. B5 additionally needs the firestore-rules
  emulator gate (JDK 21).
