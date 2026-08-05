// /gc-fitness/habits/[id]/edit/page.tsx — edit form (Server Component shell)
//
// Pre-flight pulls the doc via the gc-fitness Admin SDK and redirects:
//   - missing doc / soft-deleted → /gc-fitness/habits (404 equivalent)
//   - trainerId !== caller       → /gc-fitness/forbidden
//
// Strips server-only fields (Timestamps, deleted, id, trainerId,
// seedSource) and hands a `Partial<HabitCreateInput>` to `HabitForm` for
// the `defaultValues` seed. The form's resolver swaps to
// `habitUpdateSchemaForType(initialValues.type)` since the type is
// closure-captured (immutable post-create).

import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import {
  getCurrentTrainer,
  type CurrentTrainer,
} from "@/lib/gc-fitness/auth-helpers";
import { gcFitnessFirestore } from "@/lib/firebase/gc-fitness-admin";
import { FirestoreCollections } from "@/lib/gc-fitness/collections";
import { listClients } from "@/lib/gc-fitness/client-roster";
import { civilDateToday } from "@/lib/gc-fitness/civil-date";
import { getTrainerTimezone } from "@/lib/gc-fitness/trainer-timezone";
import type {
  HabitCreateInput,
  HabitType,
} from "@/lib/gc-fitness/habit-schema";
import { EditHabitClient } from "./client";
import { sectionMetadata } from "@/lib/gc-fitness/page-metadata";

// Tab title: "GC Fitness - <habits>" (issue #170).
export const generateMetadata = () => sectionMetadata("habits");

export const dynamic = "force-dynamic";

interface PageParams {
  params: Promise<{ id: string }>;
}

export default async function EditHabitPage({ params }: PageParams) {
  const t = await getTranslations("habits.editPage");
  let trainer: CurrentTrainer;
  try {
    trainer = await getCurrentTrainer();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Forbidden";
    if (message === "Forbidden") {
      redirect("/gc-fitness/login");
    }
    throw err;
  }

  const { id } = await params;
  const db = gcFitnessFirestore();
  const snap = await db.collection(FirestoreCollections.habits).doc(id).get();
  if (!snap.exists) {
    redirect("/gc-fitness/habits");
  }
  const data = snap.data() as Record<string, unknown> & {
    trainerId?: string;
    clientId?: string;
    type?: HabitType;
    name?: { en: string; es: string };
    description?: { en: string; es: string };
    photoUrl?: string;
    youtubeUrl?: string;
    reminderTime?: string;
    reminderEnabled?: boolean;
    reminderCadence?: "daily" | "weekly" | "monthly";
    reminderWeekdays?: number[];
    reminderDayOfMonth?: number;
    reminderMonthDays?: number[];
    scheduleType?: "one-time" | "recurring";
    startsOn?: string;
    endsOn?: string;
    scheduleCadence?: "daily" | "weekly" | "monthly";
    scheduleWeekdays?: number[];
    scheduleDayOfMonth?: number;
    scheduleMonthDays?: number[];
    deleted?: boolean;
  };

  if (data.trainerId !== trainer.uid) {
    redirect("/gc-fitness/forbidden");
  }
  if (data.deleted === true) {
    redirect("/gc-fitness/habits");
  }

  const defaults: Partial<HabitCreateInput> = {
    clientId: data.clientId,
    type: (data.type as HabitType) ?? "binary",
    name: data.name ?? { en: "", es: "" },
    description: data.description,
    photoUrl: data.photoUrl,
    youtubeUrl: data.youtubeUrl,
    reminderTime: data.reminderTime,
    reminderEnabled: data.reminderEnabled ?? false,
    reminderCadence: data.reminderCadence,
    reminderWeekdays: data.reminderWeekdays,
    reminderDayOfMonth: data.reminderDayOfMonth,
    reminderMonthDays:
      data.reminderMonthDays ??
      (typeof data.reminderDayOfMonth === "number"
        ? [data.reminderDayOfMonth]
        : undefined),
    scheduleType: data.scheduleType ?? "recurring",
    // #747 — the UTC day, not the coach's: at 21:30 in Buenos Aires the form
    // defaulted a habit to start TOMORROW.
    startsOn: data.startsOn ?? civilDateToday(await getTrainerTimezone()),
    endsOn: data.endsOn,
    scheduleCadence: data.scheduleCadence ?? "daily",
    scheduleWeekdays: data.scheduleWeekdays,
    scheduleDayOfMonth: data.scheduleDayOfMonth,
    scheduleMonthDays:
      data.scheduleMonthDays ??
      (typeof data.scheduleDayOfMonth === "number"
        ? [data.scheduleDayOfMonth]
        : undefined),
  };

  // Plan 20-07: listClients failure shouldn't 500 the edit form — the
  // habit is editable without picking a new client (clientId is immutable
  // post-create anyway). Empty roster degrades to a disabled client picker.
  let clientOptions: { uid: string; displayName: string }[] = [];
  try {
    const clients = await listClients();
    clientOptions = clients.map((c) => ({
      uid: c.uid,
      displayName: c.displayName,
    }));
  } catch {
    clientOptions = [];
  }

  return (
    <div className="mx-auto flex w-full min-w-0 max-w-3xl flex-col gap-6 px-4 py-8 sm:px-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-heading text-2xl font-semibold tracking-tight">
          {t("title")}
        </h1>
        <p className="text-sm text-muted-foreground">
          {t("subtitlePrefix")}<strong>{t("subtitleCta")}</strong>
          {t("subtitleSuffix")}
        </p>
      </div>
      <EditHabitClient
        id={id}
        defaults={defaults}
        clientOptions={clientOptions}
      />
    </div>
  );
}
