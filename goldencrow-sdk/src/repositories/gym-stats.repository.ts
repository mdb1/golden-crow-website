import { adminDb } from "../config/firebase.js";
import type { GymStatsRecord } from "../types/gym.types.js";

export async function getGymStats(): Promise<GymStatsRecord> {
  const [membersSnap, allPlansSnap, upcomingSnap] = await Promise.all([
    adminDb.collection("gym_users").get(),
    adminDb.collectionGroup("plans").get(),
    adminDb
      .collection("gym_booking_slots")
      .doc("prolife360")
      .collection("slots")
      .where("startTime", ">=", new Date())
      .get(),
  ]);

  const memberCount = membersSnap.size;

  const nowMs = Date.now();
  const activeTrainingPlanCount = allPlansSnap.docs.filter((doc) => {
    const endDate = doc.data().endDate;
    if (!endDate) return true; // no end date = ongoing
    const endMs =
      endDate.toDate
        ? endDate.toDate().getTime()
        : new Date(endDate as string).getTime();
    return endMs >= nowMs;
  }).length;

  const upcomingBookingCount = upcomingSnap.size;

  return { memberCount, activeTrainingPlanCount, upcomingBookingCount };
}
