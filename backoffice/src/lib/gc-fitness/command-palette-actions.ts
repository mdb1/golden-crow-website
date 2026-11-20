// command-palette-actions.ts — #496 (⌘K / Ctrl+K)
//
// The one read behind the coach portal's command palette. It reuses the
// already-cheap readers instead of new queries:
//   - `listClients()`           — the per-coach roster, 60 s data cache;
//   - `listWorkoutTemplates()`  — own + standard, two equality queries;
//   - `listExercisesForViewer()`— cached shared catalog + `ownerId == me` (#495).
// Chats are 1:1 with clients (chat id = client uid), so they need no read.
//
// RETURNS its failure (ActionResult, #1104) — the palette shows the static
// navigation either way, and a thrown error would arrive as "Minified React
// error #441". Only async exports here (`"use server"`).

"use server";

import { getCurrentTrainer } from "./auth-helpers";
import { toActionFailure, type ActionResult } from "./action-result";
import { listClients } from "./client-roster";
import { listExercisesForViewer } from "./exercise-list-actions";
import { listWorkoutTemplates } from "./workout-template-actions";
import { PALETTE_CAPS, type CommandPaletteIndex } from "./command-palette-index";

export async function getCommandPaletteIndex(): Promise<
  ActionResult<{ index: CommandPaletteIndex }>
> {
  try {
    // Gate first: the readers below gate themselves too, but an anonymous
    // caller must not even start three reads.
    await getCurrentTrainer();
    const [clients, { templates }, { exercises }] = await Promise.all([
      listClients(),
      listWorkoutTemplates(),
      listExercisesForViewer(),
    ]);
    return {
      ok: true,
      index: {
        clients: clients
          .filter((c) => !c.uid.startsWith("mirror:"))
          .slice(0, PALETTE_CAPS.clients)
          .map((c) => ({
            id: c.uid,
            name: c.coachNickname?.trim() || c.displayName || c.email,
            email: c.email,
          })),
        templates: templates
          .slice(0, PALETTE_CAPS.templates)
          .map((t) => ({ id: t.id, name: { en: t.name?.en ?? "", es: t.name?.es ?? "" } })),
        exercises: exercises
          .slice(0, PALETTE_CAPS.exercises)
          .map((e) => ({ id: e.id, name: { en: e.name?.en ?? "", es: e.name?.es ?? "" } })),
      },
    };
  } catch (err) {
    return toActionFailure(err);
  }
}
