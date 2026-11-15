// Public props of <TemplateForm> (#507 — split out of template-form.tsx).

import type { WorkoutTemplateInput } from "@/lib/gc-fitness/workout-template-schema";

export type TemplateFormMode = "create" | "edit";

export interface TemplateFormProps {
  mode: TemplateFormMode;
  defaultValues?: Partial<WorkoutTemplateInput>;
  /**
   * Server-side handler. Resolves with `{ id }` on create (form redirects
   * to the list), or `{ ok: true }` on edit (form toasts + stays). Throws
   * on validation/auth/Firestore failure — the form surfaces a toast.
   */
  onSubmit: (
    input: WorkoutTemplateInput,
  ) => Promise<{ id?: string; ok?: true; deferNavigation?: boolean }>;
  /**
   * Unique key used to autosave/restore unfinished work in localStorage.
   * Typically "new" for the create surface and `edit:${templateId}` for
   * the edit surface. If omitted, draft autosave is disabled.
   */
  draftKey?: string;
  /**
   * Optional create-mode hook. When provided, a successful CREATE calls this
   * with the new template id INSTEAD of the default `router.back()` navigation
   * — letting an embedding flow (e.g. the workout generator) keep the form on
   * screen and transition to its own success/assign step. No effect in edit
   * mode. Backwards-compatible: when omitted, create navigates back as before.
   */
  onCreated?: (id: string) => void;
  /**
   * Optional per-exercise extras rendered UNDER each exercise row in the
   * "pick exercises" step. The workout generator uses this to render
   * replacement pills (the normal create/edit flow passes nothing, so the
   * layout is unchanged). `onReplace` swaps the row's exercise id.
   */
  renderExerciseExtras?: (ctx: {
    index: number;
    exerciseId: string;
    allExerciseIds: string[];
    onReplace: (exerciseId: string) => void;
  }) => React.ReactNode;
  /**
   * Force the initial collapsed/expanded state of the translation fields,
   * overriding the default "expand when the record is already bilingual" rule.
   * The workout generator pre-fills BOTH languages of the name, which would
   * otherwise auto-expand both panes; passing `false` keeps the coach-language-
   * first single field (with the "add translation" toggle) like every other
   * create flow. The pre-filled other-language value is preserved until edited.
   */
  initialShowTranslation?: boolean;
  /**
   * Optional initial muscle/equipment filters for the per-exercise picker
   * popover. The workout generator passes the routine's selected equipment +
   * muscle groups so swapping an exercise opens the picker already scoped to
   * the same filters (issue #361). Omitted in the normal create/edit flow →
   * the picker opens unfiltered as before.
   */
  pickerInitialFilters?: { muscles?: string[]; equipment?: string[] };
}
