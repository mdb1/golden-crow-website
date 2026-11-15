"use client";

// dnd-kit row wrapper of the template form's exercise list (#507).

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

export type SortableListeners = ReturnType<typeof useSortable>["listeners"];

// Plan 21-02 — Thin sortable wrapper. Owns the dnd-kit ref / transform /
// transition / aria attributes for the row, but delegates the drag listeners
// to the grip handle via a render-prop so the rest of the row (form inputs,
// buttons) stays click-only.
export function SortableExerciseRow({
  id,
  children,
}: {
  id: string;
  children: (handleProps: SortableListeners) => React.ReactNode;
}) {
  const {
    setNodeRef,
    transform,
    transition,
    listeners,
    attributes,
    isDragging,
  } = useSortable({ id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  return (
    <li ref={setNodeRef} style={style} {...attributes}>
      {children(listeners)}
    </li>
  );
}
