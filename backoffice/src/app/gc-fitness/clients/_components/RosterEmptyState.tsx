// RosterEmptyState.tsx
// Plan 12-04 Task 3 — designed empty state for the trainer's client
// roster page when no clients have been assigned yet.
//
// PATTERN SOURCE — clones the in-table inline message that was previously
// rendered as a single muted-text TableCell row (RosterTable.tsx
// lines 213-221, pre-12-04). Replaces that minimal message with a
// designed Card-based hero that matches the iOS empty-state companions
// shipped in the same plan (EmptyHabitsView, EmptyExerciseLibraryView).
//
// PITFALL 20 INOCULATION ("Looks Done But Isn't"):
//   This empty state should rarely trigger for a returning trainer (they
//   already have clients in the production Firebase project). Triggers:
//     - Brand-new trainer account pre-assignment.
//     - Trainer-test / staging account where roster docs are seeded
//       on-demand.
//     - Edge: trainer whose entire roster was archived (e.g. season end).
//
// COMPONENT SHAPE:
//   - shadcn Card + CardContent (already installed at
//     `components/ui/card.tsx` — same primitives ClientHeader and others
//     use in the same gc-fitness route group).
//   - lucide-react Users icon (16w x 16h muted-foreground; already a dep,
//     also used by RosterTable.tsx for the AlertCircle marker).
//   - Tailwind utility classes only; no inline styles.

import { Card, CardContent } from "@/components/ui/card";
import { Users } from "lucide-react";

/**
 * Trainer roster empty state. Rendered by RosterTable.tsx when its
 * `rows` prop is empty — short-circuits the TanStack table setup so we
 * don't pay the cost of useReactTable + memoised columns for zero rows.
 */
export function RosterEmptyState() {
  return (
    <Card className="mx-auto mt-8 max-w-xl">
      <CardContent className="flex flex-col items-center gap-3 py-12">
        <Users
          className="h-16 w-16 text-muted-foreground"
          aria-hidden="true"
        />
        <h2 className="text-lg font-semibold">No clients assigned yet</h2>
        <p className="max-w-md text-center text-sm text-muted-foreground">
          Once a client is assigned to you in the Firebase console, they
          will appear here with their latest activity and habit
          compliance.
        </p>
      </CardContent>
    </Card>
  );
}
