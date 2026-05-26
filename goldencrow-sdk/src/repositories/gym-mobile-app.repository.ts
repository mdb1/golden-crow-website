import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { adminDbFor } from "../config/firebase.js";

// The current PocketGym iOS target is configured with the MyDNAMap Firebase
// project (`goldencrow-pocketgenes`) and writes `pocketgym_*` collections there.
// Keep this mirror bound to that named app so the Pocket Gyms backoffice manages
// the data the shipped app actually reads and writes.
const mobileAppDb = adminDbFor("mydnamap");

const APP_IDENTIFIER = "pocketgym-ios";
const MOBILE_USERS_COLLECTION = "pocketgym_users";
const MOBILE_STATE_COLLECTION = "pocketgym_state";
const MOBILE_APPOINTMENTS_COLLECTION = "pocketgym_turnos";
const MOBILE_FILES_COLLECTION = "pocketgym_files";
const MOBILE_INTERACTIONS_COLLECTION = "pocketgym_interactions";
const CARE_TEAM_COLLECTION = "care_team_assignments";

export type PocketGymAppointmentStatus =
  | "pending"
  | "accepted"
  | "declined"
  | "cancelled"
  | "completed";

export interface PocketGymMobileAppOverview {
  counts: {
    users: number;
    states: number;
    appointments: number;
    pendingAppointments: number;
    files: number;
    interactions: number;
    careTeamAssignments: number;
  };
  users: PocketGymMobileUserRecord[];
  states: PocketGymStateRecord[];
  appointments: PocketGymAppointmentRecord[];
  files: PocketGymFileRecord[];
  interactions: PocketGymInteractionRecord[];
  careTeams: PocketGymCareTeamRecord[];
}

export interface PocketGymMobileUserRecord {
  id: string;
  uid: string;
  email?: string;
  displayName?: string;
  sourceFirebase?: string;
  updatedAt?: string;
}

export interface PocketGymStateRecord {
  id: string;
  userId: string;
  app?: string;
  updatedAt?: string;
  profile?: {
    displayName?: string;
    goal?: string;
    level?: string;
    targetWeeklyWorkouts?: number;
    heightCm?: number;
    targetWeightKg?: number;
  };
  summary: {
    habits: number;
    habitLogs: number;
    bodyMetrics: number;
    workoutLogs: number;
    latestWeightKg?: number;
    latestWorkoutAt?: string;
  };
}

export interface PocketGymAppointmentRecord {
  id: string;
  userId: string;
  clientName: string;
  clientEmail?: string;
  coachName?: string;
  kind: string;
  title: string;
  location?: string;
  notes?: string;
  startsAt?: string;
  durationMinutes: number;
  status: PocketGymAppointmentStatus;
  requestedAt?: string;
  updatedAt?: string;
}

export interface PocketGymFileRecord {
  id: string;
  userId: string;
  appointmentId?: string;
  scope: string;
  category: string;
  fileName: string;
  contentType?: string;
  byteCount: number;
  storagePath?: string;
  downloadURL?: string;
  note?: string;
  createdAt?: string;
  uploadedAt?: string;
}

export interface PocketGymInteractionRecord {
  id: string;
  userId: string;
  type: string;
  summary: string;
  detailText?: string;
  appointmentId?: string;
  fileId?: string;
  createdAt?: string;
}

export interface PocketGymCareTeamProfessionalRecord {
  id: string;
  role: string;
  displayName: string;
  title?: string;
  organization?: string;
  specialties: string[];
  email?: string;
  phoneNumber?: string;
  isPrimary: boolean;
  isActive: boolean;
  assignedAt?: string;
  lastContactAt?: string;
}

export interface PocketGymCareTeamRecord {
  id: string;
  userId: string;
  updatedAt?: string;
  professionals: PocketGymCareTeamProfessionalRecord[];
}

function normalizeOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function normalizeNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function timestampToIso(value: unknown): string | undefined {
  if (value instanceof Timestamp) {
    return value.toDate().toISOString();
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }

  return undefined;
}

async function listCollectionDocuments(
  collectionName: string,
  orderByField: string,
  limit = 80
) {
  const collectionRef = mobileAppDb.collection(collectionName);
  try {
    return (await collectionRef.orderBy(orderByField, "desc").limit(limit).get()).docs;
  } catch {
    return (await collectionRef.limit(limit).get()).docs;
  }
}

function parseStatePayload(data: Record<string, unknown>): Record<string, unknown> {
  const payload = data.payload;
  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    return payload as Record<string, unknown>;
  }

  if (typeof payload !== "string" || !payload.trim()) {
    return {};
  }

  try {
    const parsed = JSON.parse(payload) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function arrayLength(value: unknown): number {
  return Array.isArray(value) ? value.length : 0;
}

function getLatestIsoFromArray(
  values: unknown,
  fieldName: string
): string | undefined {
  if (!Array.isArray(values)) {
    return undefined;
  }

  return values
    .map((value) =>
      value && typeof value === "object"
        ? timestampToIso((value as Record<string, unknown>)[fieldName])
        : undefined
    )
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1);
}

function toMobileUserRecord(
  id: string,
  data: Record<string, unknown>
): PocketGymMobileUserRecord {
  return {
    id,
    uid: normalizeOptionalString(data.uid) ?? id,
    email: normalizeOptionalString(data.email),
    displayName: normalizeOptionalString(data.displayName),
    sourceFirebase: normalizeOptionalString(data.sourceFirebase),
    updatedAt: timestampToIso(data.updatedAt),
  };
}

function toStateRecord(
  id: string,
  data: Record<string, unknown>
): PocketGymStateRecord {
  const payload = parseStatePayload(data);
  const profile =
    payload.profile && typeof payload.profile === "object" && !Array.isArray(payload.profile)
      ? (payload.profile as Record<string, unknown>)
      : {};
  const bodyMetrics = payload.bodyMetrics;
  const workoutLogs = payload.workoutLogs;
  const latestBodyMetric = Array.isArray(bodyMetrics)
    ? bodyMetrics
        .filter((entry) => entry && typeof entry === "object")
        .map((entry) => entry as Record<string, unknown>)
        .sort((left, right) =>
          String(left.date ?? "").localeCompare(String(right.date ?? ""))
        )
        .at(-1)
    : undefined;

  return {
    id,
    userId: id,
    app: normalizeOptionalString(data.app),
    updatedAt: timestampToIso(data.updatedAt),
    profile: {
      displayName: normalizeOptionalString(profile.displayName),
      goal: normalizeOptionalString(profile.goal),
      level: normalizeOptionalString(profile.level),
      targetWeeklyWorkouts: normalizeNumber(profile.targetWeeklyWorkouts),
      heightCm: normalizeNumber(profile.heightCm),
      targetWeightKg: normalizeNumber(profile.targetWeightKg),
    },
    summary: {
      habits: arrayLength(payload.habits),
      habitLogs: arrayLength(payload.habitLogs),
      bodyMetrics: arrayLength(bodyMetrics),
      workoutLogs: arrayLength(workoutLogs),
      latestWeightKg:
        latestBodyMetric && typeof latestBodyMetric.weightKg === "number"
          ? latestBodyMetric.weightKg
          : undefined,
      latestWorkoutAt: getLatestIsoFromArray(workoutLogs, "date"),
    },
  };
}

function toAppointmentRecord(
  id: string,
  data: Record<string, unknown>
): PocketGymAppointmentRecord {
  return {
    id,
    userId: normalizeOptionalString(data.userId) ?? "",
    clientName: normalizeOptionalString(data.clientName) ?? "Pocket Athlete",
    clientEmail: normalizeOptionalString(data.clientEmail),
    coachName: normalizeOptionalString(data.coachName),
    kind: normalizeOptionalString(data.kind) ?? "personalTraining",
    title: normalizeOptionalString(data.title) ?? "Appointment",
    location: normalizeOptionalString(data.location),
    notes: normalizeOptionalString(data.notes),
    startsAt: timestampToIso(data.startsAt),
    durationMinutes: normalizeNumber(data.durationMinutes) ?? 60,
    status: (normalizeOptionalString(data.status) ??
      "pending") as PocketGymAppointmentStatus,
    requestedAt: timestampToIso(data.requestedAt),
    updatedAt: timestampToIso(data.updatedAt),
  };
}

function toFileRecord(id: string, data: Record<string, unknown>): PocketGymFileRecord {
  return {
    id,
    userId: normalizeOptionalString(data.userId) ?? "",
    appointmentId: normalizeOptionalString(data.appointmentId),
    scope: normalizeOptionalString(data.scope) ?? "user",
    category: normalizeOptionalString(data.category) ?? "other",
    fileName: normalizeOptionalString(data.fileName) ?? "file",
    contentType: normalizeOptionalString(data.contentType),
    byteCount: normalizeNumber(data.byteCount) ?? 0,
    storagePath: normalizeOptionalString(data.storagePath),
    downloadURL: normalizeOptionalString(data.downloadURL),
    note: normalizeOptionalString(data.note),
    createdAt: timestampToIso(data.createdAt),
    uploadedAt: timestampToIso(data.uploadedAt),
  };
}

function toInteractionRecord(
  id: string,
  data: Record<string, unknown>
): PocketGymInteractionRecord {
  return {
    id,
    userId: normalizeOptionalString(data.userId) ?? "",
    type: normalizeOptionalString(data.type) ?? "interaction",
    summary: normalizeOptionalString(data.summary) ?? "Pocket Gym interaction",
    detailText: normalizeOptionalString(data.detailText),
    appointmentId: normalizeOptionalString(data.appointmentId),
    fileId: normalizeOptionalString(data.fileId),
    createdAt: timestampToIso(data.createdAt),
  };
}

function toCareTeamRecord(
  id: string,
  data: Record<string, unknown>
): PocketGymCareTeamRecord {
  const professionals = Array.isArray(data.professionals)
    ? data.professionals
        .filter((entry) => entry && typeof entry === "object")
        .map((entry) => {
          const professional = entry as Record<string, unknown>;
          return {
            id: normalizeOptionalString(professional.id) ?? "",
            role: normalizeOptionalString(professional.role) ?? "coach",
            displayName:
              normalizeOptionalString(professional.displayName) ?? "Care professional",
            title: normalizeOptionalString(professional.title),
            organization: normalizeOptionalString(professional.organization),
            specialties: Array.isArray(professional.specialties)
              ? professional.specialties
                  .map((specialty) => normalizeOptionalString(specialty))
                  .filter((specialty): specialty is string => Boolean(specialty))
              : [],
            email: normalizeOptionalString(professional.email),
            phoneNumber: normalizeOptionalString(professional.phoneNumber),
            isPrimary: professional.isPrimary !== false,
            isActive: professional.isActive !== false,
            assignedAt: timestampToIso(professional.assignedAt),
            lastContactAt: timestampToIso(professional.lastContactAt),
          };
        })
    : [];

  return {
    id,
    userId: normalizeOptionalString(data.userId) ?? id,
    updatedAt: timestampToIso(data.updatedAt),
    professionals,
  };
}

export async function getPocketGymMobileAppOverview(): Promise<PocketGymMobileAppOverview> {
  const [users, states, appointments, files, interactions, careTeams] =
    await Promise.all([
      listCollectionDocuments(MOBILE_USERS_COLLECTION, "updatedAt"),
      listCollectionDocuments(MOBILE_STATE_COLLECTION, "updatedAt"),
      listCollectionDocuments(MOBILE_APPOINTMENTS_COLLECTION, "startsAt"),
      listCollectionDocuments(MOBILE_FILES_COLLECTION, "createdAt"),
      listCollectionDocuments(MOBILE_INTERACTIONS_COLLECTION, "createdAt"),
      listCollectionDocuments(CARE_TEAM_COLLECTION, "updatedAt"),
    ]);

  const appointmentRecords = appointments.map((doc) =>
    toAppointmentRecord(doc.id, doc.data() as Record<string, unknown>)
  );

  return {
    counts: {
      users: users.length,
      states: states.length,
      appointments: appointmentRecords.length,
      pendingAppointments: appointmentRecords.filter(
        (appointment) => appointment.status === "pending"
      ).length,
      files: files.length,
      interactions: interactions.length,
      careTeamAssignments: careTeams.length,
    },
    users: users.map((doc) =>
      toMobileUserRecord(doc.id, doc.data() as Record<string, unknown>)
    ),
    states: states.map((doc) =>
      toStateRecord(doc.id, doc.data() as Record<string, unknown>)
    ),
    appointments: appointmentRecords,
    files: files.map((doc) =>
      toFileRecord(doc.id, doc.data() as Record<string, unknown>)
    ),
    interactions: interactions.map((doc) =>
      toInteractionRecord(doc.id, doc.data() as Record<string, unknown>)
    ),
    careTeams: careTeams.map((doc) =>
      toCareTeamRecord(doc.id, doc.data() as Record<string, unknown>)
    ),
  };
}

export async function updatePocketGymAppointmentStatus(
  appointmentId: string,
  status: PocketGymAppointmentStatus
): Promise<PocketGymAppointmentRecord | null> {
  const ref = mobileAppDb.collection(MOBILE_APPOINTMENTS_COLLECTION).doc(appointmentId);
  const snapshot = await ref.get();

  if (!snapshot.exists) {
    return null;
  }

  const existing = snapshot.data() ?? {};
  await ref.set(
    {
      status,
      updatedAt: FieldValue.serverTimestamp(),
      app: APP_IDENTIFIER,
    },
    { merge: true }
  );

  const userId = normalizeOptionalString(existing.userId);
  if (userId) {
    await mobileAppDb.collection(MOBILE_INTERACTIONS_COLLECTION).add({
      app: APP_IDENTIFIER,
      appointmentId,
      createdAt: FieldValue.serverTimestamp(),
      metadata: {
        source: "backoffice",
        status,
      },
      summary: `Backoffice set appointment to ${status}`,
      type: `appointment_${status}`,
      userId,
    });
  }

  const updated = await ref.get();
  return toAppointmentRecord(
    updated.id,
    updated.data() as Record<string, unknown>
  );
}
