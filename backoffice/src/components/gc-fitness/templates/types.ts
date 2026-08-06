// templates/types.ts
//
// The one thing that survived `columns.tsx`. That module held TanStack Table
// column defs for a table the trainer template list never mounted — the real
// routing lives in the card list of `templates/client.tsx` — and only this type
// was ever imported from it. It was deleted in #307 because a grep for "where
// does a standard template go" kept landing on its unreachable actions, where a
// button labelled `duplicate` called `onEdit` → `/edit`, the exact opposite of
// the #163 invariant.

import type { WorkoutTemplateRow } from "@/lib/gc-fitness/workout-template-actions";

// List-only extension of WorkoutTemplateRow: the templates client merges in
// virtual rows backed by the `gc-fitness:template-draft:new` localStorage
// entry. Drafts are not assignable / duplicatable / deletable — only "resume"
// is offered. Real Firestore rows never set `__isDraft`.
export type TemplateListRow = WorkoutTemplateRow & { __isDraft?: boolean };
