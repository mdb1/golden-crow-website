// generator/strings.ts
//
// Self-contained bilingual copy for the Workout Generator surface. The rest of
// the backoffice uses next-intl catalogs, but this feature ships a focused
// EN/ES dictionary instead of threading ~70 keys through the two 1,797-line
// message JSONs (which is both noisy to review and easy to drift). The data
// layer (equipment groups, muscle/type presets) already carries {en,es}
// labels, so this only covers chrome/labels. Pick the active strings with
// `useGeneratorStrings()` which reads next-intl's `useLocale()`.

import { useLocale } from "next-intl";

type Locale = "en" | "es";

const COPY = {
  en: {
    pageTitle: "Workout generator",
    pageSubtitle:
      "Pick equipment, muscles, length and style — we build the workout, you fine-tune and assign it.",
    back: "Back",
    next: "Next",
    generate: "Generate workout",
    regenerate: "Regenerate",
    step: "Step",
    of: "of",

    // Step 1 — equipment
    equipmentTitle: "What equipment is available?",
    equipmentSubtitle:
      "Tap a bundle to select several at once, or pick items individually. Only exercises whose equipment you select will be used.",
    equipmentGroups: "Quick bundles",
    equipmentAll: "All equipment",
    selectedCount: "selected",
    clear: "Clear",

    // Step 2 — muscles
    musclesTitle: "Which muscles are we training?",
    musclesSubtitle:
      "Tap a focus to select a group of muscles, or hand-pick individual ones.",
    musclePresets: "Focus",
    musclesAll: "All muscles",

    // Step 3 — volume
    volumeTitle: "How long is the workout?",
    volumeSubtitle: "Pick a number of exercises or a time budget.",
    byCount: "By exercises",
    byTime: "By time",
    exercises: "exercises",
    minutes: "minutes",

    // Step 4 — type
    typeTitle: "What style of workout?",
    typeSubtitle: "This sets the sets, reps and rest timers.",

    // Step 5 — result
    resultTitle: "Your generated workout",
    resultSubtitle:
      "Tap a replacement pill to swap an exercise. Edit any number, rename it, then save.",
    workoutName: "Workout name",
    estimated: "Estimated",
    min: "min",
    sets: "Sets",
    reps: "Reps",
    rest: "Rest (s)",
    seconds: "Secs",
    weightKg: "Weight (kg)",
    modeWeightReps: "Weight × reps",
    modeReps: "Reps only",
    modeTime: "By time",
    swapTo: "Swap:",
    noReplacements: "No other matching exercises",
    save: "Save workout",
    saving: "Saving…",
    emptyResult:
      "No exercises matched those filters. Go back and widen the equipment or muscle selection.",
    poolWarning:
      "Only {n} exercises matched your filters — fewer than requested. Widen equipment/muscles for more variety.",
    remove: "Remove",
    addExercise: "Add exercise",

    // Success
    successTitle: "Workout saved!",
    successSubtitle: "Saved to your library. Assign it to clients now, or later from the schedule.",
    assign: "Assign to clients",
    viewInLibrary: "View in library",
    generateAnother: "Generate another",
    duration: "Duration",
    exercisesLabel: "Exercises",

    // Validation
    pickEquipment: "Pick at least one piece of equipment.",
    pickMuscles: "Pick at least one muscle.",
    saveFailed: "Couldn't save the workout.",
    nameRequired: "Give the workout a name.",

    // Assign modal
    assignTitle: "Assign workout",
    assignSubtitle: "Pick one or more clients and how often it repeats.",
    clients: "Clients",
    selectAll: "Select all",
    cadence: "Repeat",
    once: "Once",
    weekly: "Weekly",
    daily: "Daily",
    everyN: "Every N days",
    monthly: "Monthly",
    repeatOn: "Repeat on",
    everyNDays: "Repeat every N days",
    day: "Day",
    time: "Time (optional)",
    endDate: "End date",
    noEnd: "No end date",
    setEnd: "Set an end date",
    cancel: "Cancel",
    assignAction: "Assign",
    assigning: "Assigning…",
    assignedOk: "Assigned to {n} client(s).",
    pickClient: "Pick at least one client.",
    noClients: "No clients yet. Add a client first.",
    assignFailed: "Couldn't assign the workout.",
    weekdays: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
  },
  es: {
    pageTitle: "Generador de rutinas",
    pageSubtitle:
      "Elegí equipo, músculos, duración y estilo — armamos la rutina y vos la ajustás y asignás.",
    back: "Atrás",
    next: "Siguiente",
    generate: "Generar rutina",
    regenerate: "Regenerar",
    step: "Paso",
    of: "de",

    equipmentTitle: "¿Qué equipo hay disponible?",
    equipmentSubtitle:
      "Tocá un combo para seleccionar varios a la vez, o elegí ítems sueltos. Solo se usarán ejercicios cuyo equipo hayas seleccionado.",
    equipmentGroups: "Combos rápidos",
    equipmentAll: "Todo el equipo",
    selectedCount: "seleccionados",
    clear: "Limpiar",

    musclesTitle: "¿Qué músculos trabajamos?",
    musclesSubtitle:
      "Tocá un foco para seleccionar un grupo de músculos, o elegilos uno por uno.",
    musclePresets: "Foco",
    musclesAll: "Todos los músculos",

    volumeTitle: "¿Cuánto dura la rutina?",
    volumeSubtitle: "Elegí una cantidad de ejercicios o un tiempo disponible.",
    byCount: "Por ejercicios",
    byTime: "Por tiempo",
    exercises: "ejercicios",
    minutes: "minutos",

    typeTitle: "¿Qué estilo de rutina?",
    typeSubtitle: "Esto define las series, reps y descansos.",

    resultTitle: "Tu rutina generada",
    resultSubtitle:
      "Tocá una píldora de reemplazo para cambiar un ejercicio. Editá cualquier número, renombrala y guardá.",
    workoutName: "Nombre de la rutina",
    estimated: "Estimado",
    min: "min",
    sets: "Series",
    reps: "Reps",
    rest: "Descanso (s)",
    seconds: "Segs",
    weightKg: "Peso (kg)",
    modeWeightReps: "Peso × reps",
    modeReps: "Solo reps",
    modeTime: "Por tiempo",
    swapTo: "Cambiar:",
    noReplacements: "No hay otros ejercicios que coincidan",
    save: "Guardar rutina",
    saving: "Guardando…",
    emptyResult:
      "Ningún ejercicio coincidió con esos filtros. Volvé y ampliá el equipo o los músculos.",
    poolWarning:
      "Solo {n} ejercicios coincidieron con tus filtros — menos de los pedidos. Ampliá equipo/músculos para más variedad.",
    remove: "Quitar",
    addExercise: "Agregar ejercicio",

    successTitle: "¡Rutina guardada!",
    successSubtitle:
      "Guardada en tu biblioteca. Asignala a tus clientes ahora, o más tarde desde la agenda.",
    assign: "Asignar a clientes",
    viewInLibrary: "Ver en biblioteca",
    generateAnother: "Generar otra",
    duration: "Duración",
    exercisesLabel: "Ejercicios",

    pickEquipment: "Elegí al menos un elemento de equipo.",
    pickMuscles: "Elegí al menos un músculo.",
    saveFailed: "No se pudo guardar la rutina.",
    nameRequired: "Ponele un nombre a la rutina.",

    assignTitle: "Asignar rutina",
    assignSubtitle: "Elegí uno o más clientes y con qué frecuencia se repite.",
    clients: "Clientes",
    selectAll: "Seleccionar todos",
    cadence: "Repetir",
    once: "Una vez",
    weekly: "Semanal",
    daily: "Diario",
    everyN: "Cada N días",
    monthly: "Mensual",
    repeatOn: "Repetir los",
    everyNDays: "Repetir cada N días",
    day: "Día",
    time: "Hora (opcional)",
    endDate: "Fecha de fin",
    noEnd: "Sin fecha de fin",
    setEnd: "Definir fecha de fin",
    cancel: "Cancelar",
    assignAction: "Asignar",
    assigning: "Asignando…",
    assignedOk: "Asignada a {n} cliente(s).",
    pickClient: "Elegí al menos un cliente.",
    noClients: "Todavía no hay clientes. Agregá un cliente primero.",
    assignFailed: "No se pudo asignar la rutina.",
    weekdays: ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"],
  },
} as const;

// Widen the literal `COPY.en` shape so EN and ES (which have different string
// literals) are both assignable to the public type.
export type GeneratorStrings = {
  [K in keyof (typeof COPY)["en"]]: (typeof COPY)["en"][K] extends readonly string[]
    ? readonly string[]
    : string;
};

export function useGeneratorStrings(): GeneratorStrings {
  const locale = useLocale();
  const key: Locale = locale === "es" ? "es" : "en";
  return COPY[key];
}

/** Pick the localized side of a {en,es} label. */
export function useLocalized(): (label: { en: string; es: string }) => string {
  const locale = useLocale();
  const key: Locale = locale === "es" ? "es" : "en";
  return (label) => label[key] || label.en;
}
