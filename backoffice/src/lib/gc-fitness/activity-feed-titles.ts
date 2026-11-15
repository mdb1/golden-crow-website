// activity-feed-titles.ts — #513.
//
// The activity feed's titles are built in lib/ (activity-feed-model.ts,
// activity-feed-actions.ts) as SPANISH sentences: they also feed the CSV export
// and are matched by tests, so the data stays as it is. What changes is the
// RENDER: ActivityFeedList looks the Spanish title up here and shows
// `admin.audit.titles.<key>` in the viewer's language. A title missing from
// this map (a stored `coach_activity.title` of an unknown kind, the
// `<op> <collection>` fallback) renders verbatim, exactly as before.
//
// activity-feed-titles.test.ts pins three things: every key exists in both
// catalogs, es.json says EXACTLY the Spanish source string, and every title
// literal in the two model files is in this map (a new title without a key
// fails there, not silently on screen).

export const FEED_TITLE_KEYS = {
  "Terminó un workout": "workoutFinished",
  "Registró un workout": "workoutLogged",
  "Eliminó un workout registrado": "workoutLogDeleted",
  "Actualizó un workout registrado": "workoutLogUpdated",
  "Cambió la recurrencia de una rutina": "routineRecurrenceChanged",
  "Se extendió sola una rutina recurrente": "routineSelfExtended",
  "Se asignó un workout": "workoutSelfAssigned",
  "Asignó un workout": "workoutAssigned",
  "Eliminó workouts agendados": "scheduledWorkoutsDeleted",
  "Eliminó un workout agendado": "scheduledWorkoutDeleted",
  "Movió un workout de día": "workoutMoved",
  "Actualizó la rutina": "routineUpdated",
  "Marcó el workout como completado": "workoutMarkedComplete",
  "Apagó el recordatorio del workout": "workoutReminderOff",
  "Cambió el recordatorio del workout": "workoutReminderChanged",
  "Cambió el horario del workout": "workoutTimeChanged",
  "Actualizó un workout agendado": "scheduledWorkoutUpdated",
  "Creó su plan de nutrición": "nutritionOwnPlanCreated",
  "Asignó un plan de nutrición a varios clientes": "nutritionPlanAssignedMany",
  "Asignó un plan de nutrición": "nutritionPlanAssigned",
  "Cerró una fase de nutrición": "nutritionPhaseClosed",
  "Recortó una fase de nutrición": "nutritionPhaseShortened",
  "Quitó la fecha de fin": "nutritionEndRemoved",
  "Corrió el inicio de una fase de nutrición": "nutritionStartShifted",
  "Editó su plan de nutrición": "nutritionOwnPlanEdited",
  "Editó un plan de nutrición": "nutritionPlanEdited",
  "Creó un hábito": "habitCreated",
  "Asignó un hábito": "habitAssigned",
  "Eliminó un hábito": "habitDeleted",
  "Reactivó un hábito": "habitReactivated",
  "Dio de baja un hábito": "habitEnded",
  "Extendió un hábito": "habitExtended",
  "Apagó el recordatorio de un hábito": "habitReminderOff",
  "Cambió el recordatorio de un hábito": "habitReminderChanged",
  "Cambió la programación de un hábito": "habitScheduleChanged",
  "Actualizó un hábito": "habitUpdated",
  "Creó un ejercicio": "exerciseCreated",
  "Eliminó un ejercicio": "exerciseDeleted",
  "Editó un ejercicio": "exerciseEdited",
  "Nuevo coach": "newCoach",
  "Nuevo usuario": "newUser",
  "Cuenta eliminada": "accountDeleted",
  "Refrescó la suscripción": "subscriptionRefreshed",
  "Le activaron la suscripción": "subscriptionActivatedByAdmin",
  "Compró una suscripción": "subscriptionBought",
  "Le dieron de baja la suscripción": "subscriptionCancelledByAdmin",
  "Se quedó sin suscripción": "subscriptionLapsed",
  "Cambió la suscripción": "subscriptionChanged",
  "Cambió de coach": "coachChanged",
  "Quedó sin coach": "coachRemoved",
  "Cambió de rol": "roleChanged",
  "Cuenta desactivada": "accountDeactivated",
  "Actualizó su perfil": "profileUpdated",
  "Actualizó su cuenta": "accountUpdated",
  "Creó un workout": "templateCreated",
  "Eliminó un workout": "templateDeleted",
  "Eliminó un workout asignado": "assignedWorkoutDeleted",
  "Editó los descansos": "restEdited",
  "Eliminó un hábito asignado": "assignedHabitDeleted",
  "Escribió una nota": "noteWritten",
  "Eliminó una nota": "noteDeleted",
  "Pidió fotos de progreso": "photosRequested",
  "Canceló el pedido de fotos": "photosRequestCancelled",
  "Pidió el peso": "weightRequested",
  "Canceló el pedido de peso": "weightRequestCancelled",
  "Agregó un cliente": "clientAdded",
  "Quitó un cliente": "clientRemoved",
  "Asignó nutrición": "nutritionAssigned",
  "Eliminó una fase de nutrición": "nutritionPhaseDeleted",
  "Transfirió un cliente": "clientTransferred",
  "Desvinculó un cliente de su coach": "clientUnlinked",
  "Cambió el plan de un usuario": "userPlanChanged",
  "Eliminó un coach (cascada)": "coachCascadeDeleted",
  "Moderación: ocultó contenido reportado": "moderationHide",
  "Moderación: suspendió una cuenta": "moderationSuspend",
  "Moderación: descartó reportes": "moderationDismiss",
  "Moderación: levantó una suspensión": "moderationUnsuspend",
  "Moderación: volvió a mostrar contenido": "moderationUnhide",
  "Desactivó un cliente": "clientDeactivated",
  "Eliminó un cliente pendiente": "pendingClientDeleted",
  "Eliminó un cliente (cascada)": "clientCascadeDeleted",
  "Subió fotos de progreso": "progressPhotosUploaded",
  "Subió una foto de progreso": "progressPhotoUploaded",
  "Desmarcó un hábito": "habitUnticked",
  "Marcó un hábito": "habitTicked",
  "Cerró el día de comidas": "mealDayClosed",
  "Marcó comidas del plan": "mealsMarked",
  "Actividad": "activityFallback",
} as const;

export type FeedTitleKey = (typeof FEED_TITLE_KEYS)[keyof typeof FEED_TITLE_KEYS];

/** The catalog key for a feed title, or null when it is not a known one. */
export function feedTitleKey(title: string): FeedTitleKey | null {
  return Object.prototype.hasOwnProperty.call(FEED_TITLE_KEYS, title)
    ? FEED_TITLE_KEYS[title as keyof typeof FEED_TITLE_KEYS]
    : null;
}
