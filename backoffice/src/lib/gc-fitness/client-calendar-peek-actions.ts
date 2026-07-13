"use server";

import { gcFitnessFirestore } from "@/lib/firebase/gc-fitness-admin";

import { getCurrentTrainer } from "./auth-helpers";
import { civilDateToday } from "./civil-date";
import { FirestoreCollections } from "./collections";
import {
  listMonthForClients,
  type MonthCalendarPayload,
} from "./schedule-month-actions";

const DAY_MS = 86_400_000;
const CIVIL_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export interface ClientCalendarPeekPayload {
  anchorCivil: string;
  startCivil: string;
  endCivil: string;
  todayCivil: string;
  calendar: MonthCalendarPayload;
}

export async function getClientCalendarPeek(input: {
  clientId: string;
  anchorCivil?: string;
}): Promise<ClientCalendarPeekPayload> {
  const trainer = await getCurrentTrainer();
  const db = gcFitnessFirestore();

  const clientSnap = await db
    .collection(FirestoreCollections.users)
    .doc(input.clientId)
    .get();
  if (!clientSnap.exists) {
    throw new Error("Not found");
  }

  const client = clientSnap.data() as {
    coachId?: string;
    timezone?: string;
  };
  if (client.coachId !== trainer.uid) {
    throw new Error("Forbidden");
  }

  const timezone =
    typeof client.timezone === "string" && client.timezone.length > 0
      ? client.timezone
      : "UTC";
  const todayCivil = civilDateToday(timezone);
  const anchorCivil = isValidCivilDate(input.anchorCivil)
    ? input.anchorCivil
    : todayCivil;
  const startCivil = addCivilDays(anchorCivil, -3);
  const endCivil = addCivilDays(anchorCivil, 3);
  const calendar = await listMonthForClients({
    startCivil,
    endCivil,
    clientIds: [input.clientId],
    todayCivil,
  });

  return {
    anchorCivil,
    startCivil,
    endCivil,
    todayCivil,
    calendar,
  };
}

function isValidCivilDate(value: unknown): value is string {
  if (typeof value !== "string" || !CIVIL_DATE_PATTERN.test(value)) {
    return false;
  }
  return formatCivilDate(parseCivilDate(value)) === value;
}

function addCivilDays(civilDate: string, days: number): string {
  return formatCivilDate(
    new Date(parseCivilDate(civilDate).getTime() + days * DAY_MS),
  );
}

function parseCivilDate(civilDate: string): Date {
  const [year, month, day] = civilDate.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function formatCivilDate(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
