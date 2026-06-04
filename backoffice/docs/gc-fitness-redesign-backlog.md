# GC Fitness Coach Portal — redesign backlog

Living backlog for the 2026-06 redesign on branch
`feat/gc-fitness-backoffice-redesign`. Captures all feedback so nothing is lost.
Status: ☐ todo · ◐ in progress · ☑ done. Companion to
`docs/gc-fitness-redesign.md` (design system).

## Done (committed)
- ☑ Foundation: tokens (light+dark), shell, primitives (PageHeader/StatCard/PillTabs), Biblioteca consolidation.
- ☑ Hero screens restyle (dashboard, clients, recent-logs, notifications, my-activity, chat, agenda, biblioteca, settings) + secondary routes.
- ☑ Sidebar: solid-gold active pill (no shadow), bigger font, grouped nav, real Golden Crow logo.
- ☑ Agenda client selector → design system + avatars.
- ☑ Client photos in pickers (recent-logs filter, habits filter).
- ☑ Loading skeletons for instant navigation.
- ☑ i18n: Spanish-first default + redesign hero literals routed through catalog.

## A. Quick visual / UX fixes
- ☐ **A1** Dashboard "Actividad reciente": remove the adherence **% numbers** from the rows — they shift as more pages load and read as misleading. (img: dashboard recent activity)
- ☐ **A2** Dashboard: add a **CTA to Schedule** (agenda) — missing.
- ☐ **A3** **Client names are links** to their profile everywhere they appear (dashboard rows, recent-logs rows, my-activity, etc.) → `/gc-fitness/clients/[id]`.
- ☐ **A4** Clients page "Filtros": unclear it only filters **needs-attention**. Make it an explicit labelled toggle ("Necesitan atención") instead of a vague "Filtros (N)".
- ☐ **A5** Client detail: the **client name is duplicated** (ClientHeader + another spot). Remove the dup.
- ☐ **A6** **Chat**: too much padding + rounded card. Make it **full-bleed** (occupy all available space), no rounded outer card.
- ☐ **A7** Settings: theme control shows "**Dark**" while the app is **light** — confusing/buggy. Make it a clear current-state control (Claro/Oscuro). Also finish settings i18n: "Language"→Idioma, "Quick replies"→Respuestas rápidas, "1 guardadas" etc.
- ☐ **A8** Animate the **skeleton → loaded** transition (fade/cross-fade) so it doesn't pop.

## B. Biblioteca restructure
- ☐ **B1** Workouts (Entrenamientos): switch from cards to a **vertical list** — cards add little here.
- ☐ **B2** Habits **Library** list: show the **habit photo** (if any); **remove the "Reminder" column** — reminders only make sense in Assignments, not the library.
- ☐ **B3** Habits **Assignments**: switch to a **vertical list grouped by habit title**, so you can see who has each habit; show recurrence/reminder per individual assignment.
- ☐ **B4** **New Exercise** and **New Habit**: convert from their own routes to a **modal/popup over the library**. Keep the **workout creator** as its own route (it's multi-step).
- ☐ **B5** Allow **delete/hide habits from the standard (global) library** — currently impossible.
- ☐ **B6** Habit **delete confirm**: show **impact on assignments** — what happens to them, to whom, and their recurrences.

## C. Client-detail features
- ☐ **C1** "Pedidos al cliente" (client requests): show a **fulfilled note** — whether the client already uploaded photos/weight **after** the request date.
- ☐ **C2** Body-weight chart "Último": show the record **closest to today by date** (not just last-created).
- ☐ **C3** Body-weight chart: add a **timeline range selector** like the other charts.
- ☐ **C4** New route + CTA: **per-client per-exercise progress charts** (e.g. flat-bench weight over time), mirroring the iOS app.

## D. i18n — deep forms (pre-existing debt, larger)
- ☐ **D1** Deep forms/dialogs are still English-only (New Exercise form, exercise/habit forms, schedule dialogs, habit detail). Route through the catalog (es-first). Large; do incrementally.

## Notes / constraints
- Tokens only (both themes). Preserve all data/logic/server-actions. Spanish-first.
- Test gate before push: backoffice `npx jest` (1 known locale flake), `next build`, `tsc`.
- Don't touch firestore.rules behavior without the rules test gate.
