import type { QueryDocumentSnapshot } from "firebase-admin/firestore";

import { gcFitnessFirestore } from "@/lib/firebase/gc-fitness-admin";

import { FirestoreCollections } from "./collections";
import type { ClientRosterEntry } from "./client-roster";

export type BirthdayNotification = {
  id: string;
  clientId: string;
  clientName: string;
  birthDate: string;
  title: string;
  detail: string;
  actionHref: string;
  actionLabel: string;
  sortAtISO: string;
};

function monthDay(value: string): string | null {
  const parts = value.split("-");
  if (parts.length !== 3) return null;
  const month = parts[1];
  const day = parts[2];
  if (!month || !day) return null;
  return `${month}-${day}`;
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

// Regression (#451): a Feb 29 birthday is celebrated on Feb 28 in non-leap
// years — before, it matched nothing 3 years out of 4.
function observedMonthDay(birthMonthDay: string | null, todayCivil: string): string | null {
  if (birthMonthDay !== "02-29") return birthMonthDay;
  const year = Number(todayCivil.split("-")[0]);
  if (!Number.isInteger(year) || isLeapYear(year)) return birthMonthDay;
  return "02-28";
}

function mapBirthdayClient(doc: QueryDocumentSnapshot): ClientRosterEntry {
  const data = doc.data() as {
    email?: string;
    displayName?: string;
    photoURL?: string;
    birthDate?: string;
    coachNickname?: string;
  };
  return {
    uid: doc.id,
    email: typeof data.email === "string" ? data.email : "",
    displayName:
      typeof data.displayName === "string" && data.displayName.trim().length > 0
        ? data.displayName.trim()
        : typeof data.email === "string" && data.email.trim().length > 0
          ? data.email.trim()
          : doc.id,
    timezone: null,
    photoURL: typeof data.photoURL === "string" ? data.photoURL : null,
    birthDate: typeof data.birthDate === "string" ? data.birthDate : null,
    coachNickname: typeof data.coachNickname === "string" ? data.coachNickname : null,
    pendingProvisioning: false,
    autoAssignedCoach: false,
  };
}

export function listBirthdayNotifications(
  clients: ClientRosterEntry[],
  todayCivil: string,
): BirthdayNotification[] {
  const todayMonthDay = monthDay(todayCivil);
  if (!todayMonthDay) return [];

  return clients.flatMap((client) => {
    const birthDate = client.birthDate?.trim();
    if (!birthDate) return [];
    if (observedMonthDay(monthDay(birthDate), todayCivil) !== todayMonthDay) return [];
    const name = client.coachNickname?.trim() || client.displayName || client.email || client.uid;
    return [{
      id: `birthday:${client.uid}:${todayCivil}`,
      clientId: client.uid,
      clientName: name,
      birthDate,
      title: "Birthday",
      detail: "Send a birthday message to your client.",
      actionHref: `/gc-fitness/clients/${client.uid}`,
      actionLabel: "Open client",
      sortAtISO: `${todayCivil}T12:00:00.000Z`,
    }];
  });
}

export async function listBirthdayNotificationsForTrainer(
  trainerUid: string,
  todayCivil: string,
): Promise<BirthdayNotification[]> {
  const snap = await gcFitnessFirestore()
    .collection(FirestoreCollections.users)
    .where("coachId", "==", trainerUid)
    .where("role", "==", "client")
    .get();
  const clients = snap.docs.map(mapBirthdayClient);
  return listBirthdayNotifications(clients, todayCivil);
}

export async function birthdayNotificationCountForTrainer(
  trainerUid: string,
  todayCivil: string,
): Promise<number> {
  return (await listBirthdayNotificationsForTrainer(trainerUid, todayCivil)).length;
}

export function birthdayNotificationCount(
  clients: ClientRosterEntry[],
  todayCivil: string,
): number {
  return listBirthdayNotifications(clients, todayCivil).length;
}
