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

import {
  getCurrentTrainer,
  type CurrentTrainer,
} from "@/lib/gc-fitness/auth-helpers";
import { gcFitnessFirestore } from "@/lib/firebase/gc-fitness-admin";
import { FirestoreCollections } from "@/lib/gc-fitness/collections";
import { listClients } from "@/lib/gc-fitness/client-roster";
import type {
  HabitCreateInput,
  HabitType,
} from "@/lib/gc-fitness/habit-schema";
import { EditHabitClient } from "./client";

export const dynamic = "force-dynamic";

interface PageParams {
  params: Promise<{ id: string }>;
}

export default async function EditHabitPage({ params }: PageParams) {
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
    options?: string[];
    targetValue?: number;
    unit?: string;
    reminderTime?: string;
    reminderEnabled?: boolean;
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
    options: data.options,
    targetValue: data.targetValue,
    unit: data.unit,
    reminderTime: data.reminderTime,
    reminderEnabled: data.reminderEnabled ?? false,
  };

  const clients = await listClients();
  const clientOptions = clients.map((c) => ({
    uid: c.uid,
    displayName: c.displayName,
  }));

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-8">
      <div className="flex flex-col gap-1">
        <h1 className="font-heading text-2xl font-semibold tracking-tight">
          Edit habit
        </h1>
        <p className="text-sm text-muted-foreground">
          Changes save when you click <strong>Save changes</strong>. The
          client and habit type are immutable.
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
