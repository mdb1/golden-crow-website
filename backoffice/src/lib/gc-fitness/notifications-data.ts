// notifications-data.ts
//
// The reads behind /gc-fitness/notifications (#507 — moved out of the page).
// Server-only (Admin SDK through the modules it calls), but NOT a "use server"
// module: it is called from the Server Component, never from the browser, so
// it adds no Server Action IDs and can't skew a deploy.
//
// The read order is the one the page had:
//   1. the roster first — workout_logs.trainerId goes stale on coach transfer,
//      so the PR feed must be scoped to the CURRENT roster (users.coachId),
//      issue #446. listClients() is cached (unstable_cache + per-request
//      dedupe), so awaiting it before the Promise.all costs nothing;
//   2. the five independent feeds in parallel;
//   3. birthdays.

import { gcFitnessFirestore } from "@/lib/firebase/gc-fitness-admin";

import { listBirthdayNotificationsForTrainer, type BirthdayNotification } from "./birthday-notifications";
import { listClients } from "./client-roster";
import { listMyCoachActivityPage, type MyCoachActivityRow } from "./coach-activity-actions";
import { listHabitsForTrainer, type HabitRow } from "./habit-actions";
import { listActiveWorkoutSessionsForTrainer } from "./live-workout-actions";
import type { ActiveWorkoutCardData } from "./notifications-feed";
import { listRecentPrWorkoutNotifications, type PrNotification } from "./pr-notifications";
import { listRecentLogsForTrainerPage, type RecentLogRow } from "./recent-logs-actions";

/** Coach-activity rows scanned for workout series about to end. */
export const NOTIFICATIONS_WORKOUT_ACTIVITY_LIMIT = 100;
/** Recent signups scanned for "client activated" rows. */
export const NOTIFICATIONS_ACTIVATIONS_LIMIT = 20;

export interface NotificationSources {
  clientNameById: Map<string, string>;
  /** Live sessions, with the roster display name resolved. */
  activeWorkouts: ActiveWorkoutCardData[];
  /** PR feed, with the roster display name preferred over the log's. */
  prNotifications: PrNotification[];
  workoutActivityRows: MyCoachActivityRow[];
  habits: HabitRow[];
  activationLogs: RecentLogRow[];
  birthdayNotifications: BirthdayNotification[];
}

export async function loadNotificationSources(input: {
  trainerUid: string;
  todayCivil: string;
  /** Formats the "(antes …)" suffix of a PR line (localized by the caller). */
  formatPreviousPr: (value: string) => string;
}): Promise<NotificationSources> {
  const { trainerUid, todayCivil, formatPreviousPr } = input;

  const clients = await listClients();
  const rosterUids = new Set(clients.map((client) => client.uid));
  const [activeWorkoutSummaries, workoutActivity, habits, activations, prNotificationsRaw] =
    await Promise.all([
      listActiveWorkoutSessionsForTrainer(),
      listMyCoachActivityPage(null, NOTIFICATIONS_WORKOUT_ACTIVITY_LIMIT, null, "workout_assignment"),
      listHabitsForTrainer(),
      listRecentLogsForTrainerPage(null, NOTIFICATIONS_ACTIVATIONS_LIMIT, null, "signup"),
      listRecentPrWorkoutNotifications(gcFitnessFirestore(), trainerUid, rosterUids, formatPreviousPr),
    ]);
  const birthdayNotifications = await listBirthdayNotificationsForTrainer(trainerUid, todayCivil);

  const clientNameById = new Map(
    clients.map((client) => [client.uid, client.displayName]),
  );
  const activeWorkouts: ActiveWorkoutCardData[] = activeWorkoutSummaries.map((item) => ({
    ...item,
    clientName: clientNameById.get(item.clientId) ?? item.clientId,
  }));
  const prNotifications = prNotificationsRaw.map((item) => ({
    ...item,
    clientName: clientNameById.get(item.clientId) ?? item.clientName,
  }));

  return {
    clientNameById,
    activeWorkouts,
    prNotifications,
    workoutActivityRows: workoutActivity.rows,
    habits,
    activationLogs: activations.logs,
    birthdayNotifications,
  };
}
