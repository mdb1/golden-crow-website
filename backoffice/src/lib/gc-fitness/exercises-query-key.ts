// exercises-query-key.ts
//
// The shared React-Query cache key for the trainer exercises feed, kept in
// its OWN module with ZERO firebase imports.
//
// Why separate from `exercises-listener.ts`: that module imports the firebase
// CLIENT SDK (`firebase/firestore`). Call sites that only need the KEY to
// invalidate the feed after a mutation — e.g. `ExerciseForm`, which does NOT
// render `useExercisesQuery` — must be able to import the key WITHOUT dragging
// the firebase client SDK into their module graph (which breaks the
// ts-jest/node test env with `ReferenceError: fetch is not defined`, and
// needlessly bloats their bundle). `exercises-listener.ts` re-exports this so
// existing `useExercisesQuery` consumers keep importing it from there.

export const EXERCISES_QUERY_KEY = ["gc-fitness", "exercises"] as const;
