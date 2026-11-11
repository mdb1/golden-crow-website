import { randomUUID } from "node:crypto";
import type { Transaction } from "firebase-admin/firestore";
import { adminDbFor } from "../config/firebase.js";
import { isGlobalAdminRole } from "../lib/admin-roles.js";
import { normalizePGFlexPickupOrigin, PGFLEX_2PQ_DESTINATION } from "../lib/pgflex-address.js";
import {
  sendTreatmentPickupEmail,
  type TreatmentPickupEmailDetails,
  type TreatmentPickupEmailKind,
} from "../lib/pgflex-dispatcher-email.js";
import type { AdminContext, AdminRole, TwoPQTreatmentStartInformation } from "../types/sdk.types.js";
import { AdminRepositoryError } from "./admin-errors.js";
import { cascadeTwoPQCaseStatusToSamplingChildren } from "./two-pq-sampling-status.repository.js";
import { synchronizeTwoPQCasesFilesAndCodes } from "./two-pq-auto-sync.repository.js";

const db = adminDbFor("mydnamap");
const EVENTS = "pgflex_events";
const FORMS = "2pq_forms";
const CASES = "2pq_case";
export const TREATMENT_PICKUP_SOURCE = "2pq_treatment_start";
const MAX_GROUP_SIZE = 50;
const EMAIL_LEASE_MS = 120_000;
const EMAIL_KINDS: TreatmentPickupEmailKind[] = ["planned", "confirmed", "rescheduled", "cancelled"];

type PickupStatus = "planned" | "confirmed" | "cancelled" | "in_transit" | "arrived" | "lost";
type EmailState = "pending" | "sending" | "sent" | "failed";
type EmailStatus = EmailState | "unassigned";
type Dispatcher = { email: string; firebaseUid: string; displayName?: string };
type Schedule = {
  pickupDate: string;
  pickupWindowStart: string;
  pickupWindowEnd: string;
  origin: string;
  destination: string;
};
type Member = {
  doctorId: string;
  treatmentDate: string;
  estimatedBiopsyDate: string;
  biopsyDate?: string;
  caseId: string | null;
  code: string | null;
  removed?: true;
};
type Notification = {
  id: string;
  state: EmailState;
  details: TreatmentPickupEmailDetails;
  claim?: string;
  leaseUntil?: number;
  sentAt?: string;
  failedAt?: string;
};
type PickupEvent = Schedule & {
  source: typeof TREATMENT_PICKUP_SOURCE;
  sourceFormId: string;
  shipmentType: "2pq";
  identifier: string;
  institutionId: string;
  status: PickupStatus;
  temperatureC: 4 | -20;
  members: Record<string, Member>;
  linkedCaseIds: string[];
  linked_codes: string | null;
  expectedCaseCount: number;
  readyCaseCount: number;
  dispatcherId: string | null;
  dispatcherFirebaseId: string | null;
  dispatcherEmail: string | null;
  dispatcherDisplayName: string | null;
  timeRequested: string;
  pickupTime: string | null;
  createdAt: string;
  createdByEmail: string;
  updatedAt: string;
  updatedByEmail: string;
  confirmedAt?: string;
  notifications: Partial<Record<TreatmentPickupEmailKind, Notification>>;
  latestEmailKind?: TreatmentPickupEmailKind;
};

export type TreatmentPickupSummary = Schedule & {
  id: string;
  status: PickupStatus;
  temperatureC: 4 | -20;
  expectedCaseCount: number;
  readyCaseCount: number;
  canManage: boolean;
  estimatedBiopsyDate?: string;
  plannedEmailStatus?: EmailStatus;
  confirmedEmailStatus?: EmailStatus;
  latestEmailStatus?: EmailStatus;
};

export type TreatmentPickupMutation =
  | { action: "cancel" | "retry_notifications" }
  | {
      action: "reschedule";
      pickupDate: string;
      pickupWindowStart: string;
      pickupWindowEnd: string;
      pickupOrigin: string;
    };

function eventData(data: FirebaseFirestore.DocumentData | undefined): PickupEvent | null {
  return data?.source === TREATMENT_PICKUP_SOURCE ? data as PickupEvent : null;
}

function canManagePickup(context: AdminContext, event: PickupEvent) {
  if (isGlobalAdminRole(context.role)) return true;
  if (context.institutionId !== event.institutionId) return false;
  if (context.role === "institution_doctor") {
    return Boolean(context.doctorId) && Object.values(event.members).every(
      (member) => member.doctorId === context.doctorId,
    );
  }
  return context.role === "institution_admin" ||
    context.role === "institution_operator" ||
    context.role === "institution_laboratory_staff";
}

function pickupSchedule(
  input: {
    pickupDate: string;
    pickupWindowStart: string;
    pickupWindowEnd: string;
    pickupOrigin: string;
  },
  existingOrigin?: string,
): Schedule {
  const date = new Date(`${input.pickupDate}T00:00:00.000Z`);
  const validTime = /^(?:[01][0-9]|2[0-3]):[0-5][0-9]$/;
  let origin = input.pickupOrigin.trim();
  if (origin !== existingOrigin) {
    const normalizedOrigin = normalizePGFlexPickupOrigin(origin);
    if (!normalizedOrigin.ok) throw new AdminRepositoryError(normalizedOrigin.message, 400);
    origin = normalizedOrigin.value;
  }
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(input.pickupDate) ||
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 10) !== input.pickupDate ||
    !validTime.test(input.pickupWindowStart) ||
    !validTime.test(input.pickupWindowEnd) ||
    input.pickupWindowEnd <= input.pickupWindowStart ||
    !origin || origin.length > 240
  ) {
    throw new AdminRepositoryError("Enter a valid pickup date, time window, and origin.", 400);
  }
  return {
    pickupDate: input.pickupDate,
    pickupWindowStart: input.pickupWindowStart,
    pickupWindowEnd: input.pickupWindowEnd,
    origin,
    destination: PGFLEX_2PQ_DESTINATION,
  };
}

function sameSchedule(left: Schedule, right: Schedule) {
  const storedOrigin = normalizePGFlexPickupOrigin(left.origin);
  return left.pickupDate === right.pickupDate &&
    left.pickupWindowStart === right.pickupWindowStart &&
    left.pickupWindowEnd === right.pickupWindowEnd &&
    (left.origin === right.origin || (storedOrigin.ok && storedOrigin.value === right.origin)) &&
    left.destination === right.destination;
}

function validatePickupDate(event: PickupEvent, schedule: Schedule) {
  for (const member of Object.values(event.members)) {
    if (member.removed) continue;
    if (!pickupDateMatchesBiopsy(event.temperatureC, schedule.pickupDate, member.biopsyDate ?? member.estimatedBiopsyDate)) {
      throw new AdminRepositoryError(
        "Pickup must be on or after the estimated biopsy date, and on the same day for refrigerated material.",
        400,
      );
    }
  }
}

function pickupDateMatchesBiopsy(temperatureC: 4 | -20, pickupDate: string, biopsyDate: string) {
  return temperatureC === 4 ? pickupDate === biopsyDate : pickupDate >= biopsyDate;
}

function validateActualBiopsyDate(event: PickupEvent, biopsyDate: string) {
  if (event.status !== "cancelled" && !pickupDateMatchesBiopsy(event.temperatureC, event.pickupDate, biopsyDate)) {
    throw new AdminRepositoryError("The biopsy date does not match the planned pickup. Update the treatment pickup before saving the biopsy.", 409);
  }
}

function notification(
  id: string,
  event: PickupEvent,
  kind: TreatmentPickupEmailKind,
): PickupEvent["notifications"] {
  return {
    ...event.notifications,
    [kind]: {
      id: randomUUID(),
      state: "pending",
      details: {
        id,
        identifier: event.identifier,
        origin: event.origin,
        destination: event.destination,
        pickupDate: event.pickupDate,
        pickupWindowStart: event.pickupWindowStart,
        pickupWindowEnd: event.pickupWindowEnd,
        temperatureC: event.temperatureC,
        expectedCaseCount: event.expectedCaseCount,
        codes: kind === "planned" ? [] : (event.linked_codes?.split(",") ?? []),
      },
    },
  };
}

function dispatcherFields(dispatcher: Dispatcher | null | undefined) {
  return {
    dispatcherId: dispatcher?.firebaseUid ?? null,
    dispatcherFirebaseId: dispatcher?.firebaseUid ?? null,
    dispatcherEmail: dispatcher?.email ?? null,
    dispatcherDisplayName: dispatcher?.displayName ?? null,
  };
}

function toSummary(id: string, event: PickupEvent, context?: AdminContext): TreatmentPickupSummary {
  function emailStatus(kind: TreatmentPickupEmailKind): EmailStatus | undefined {
    const message = event.notifications[kind];
    if (!message) return undefined;
    if (!event.dispatcherEmail) return "unassigned";
    if (message.state === "sending" && (message.leaseUntil ?? 0) <= Date.now()) return "pending";
    return message.state;
  }
  return {
    id,
    status: event.status,
    origin: event.origin,
    destination: event.destination,
    pickupDate: event.pickupDate,
    pickupWindowStart: event.pickupWindowStart,
    pickupWindowEnd: event.pickupWindowEnd,
    temperatureC: event.temperatureC,
    expectedCaseCount: event.expectedCaseCount,
    readyCaseCount: event.readyCaseCount,
    canManage: Boolean(context && canManagePickup(context, event)),
    estimatedBiopsyDate: event.temperatureC === 4 ? Object.values(event.members)[0]?.estimatedBiopsyDate : undefined,
    plannedEmailStatus: emailStatus("planned"),
    confirmedEmailStatus: emailStatus("confirmed"),
    latestEmailStatus: event.latestEmailKind ? emailStatus(event.latestEmailKind) : undefined,
  };
}

export async function getTreatmentPickupSummary(id: string, context?: AdminContext) {
  const snapshot = await db.collection(EVENTS).doc(id).get();
  const event = eventData(snapshot.data());
  if (!event || (context && !isGlobalAdminRole(context.role) && context.institutionId !== event.institutionId)) {
    return null;
  }
  return toSummary(id, event, context);
}

export async function validateTreatmentPickupForBiopsy(id: string, formId: string, biopsyDate: string) {
  const event = eventData((await db.collection(EVENTS).doc(id).get()).data());
  if (!event?.members[formId]) throw new AdminRepositoryError("The pickup plan for this biopsy was not found.", 409);
  validateActualBiopsyDate(event, biopsyDate);
}

export async function prepareTreatmentPickup(
  transaction: Transaction,
  input: {
    formId: string;
    institutionId: string;
    institutionName?: string;
    doctorId: string;
    actorRole: AdminRole;
    treatmentStart: TwoPQTreatmentStartInformation;
    groupWithTreatmentStartFormId?: string;
    dispatcher?: Dispatcher | null;
    actorEmail: string;
    now: string;
  },
) {
  const { treatmentStart, formId, institutionId, doctorId, now, actorEmail } = input;
  const schedule = pickupSchedule(treatmentStart);
  const member: Member = {
    doctorId,
    treatmentDate: treatmentStart.treatmentDate,
    estimatedBiopsyDate: treatmentStart.estimatedBiopsyDate,
    caseId: null,
    code: null,
  };
  let id = `pgflex_treatment_${formId.toLowerCase()}`;
  let event: PickupEvent = {
    ...schedule,
    source: TREATMENT_PICKUP_SOURCE,
    sourceFormId: formId,
    shipmentType: "2pq",
    identifier: `${input.institutionName || institutionId} · ${formId}`.slice(0, 160),
    institutionId,
    status: "planned",
    temperatureC: treatmentStart.temperatureC,
    members: { [formId]: member },
    expectedCaseCount: 1,
    readyCaseCount: 0,
    linkedCaseIds: [],
    linked_codes: null,
    ...dispatcherFields(input.dispatcher),
    pickupTime: null,
    timeRequested: now,
    createdAt: now,
    createdByEmail: actorEmail,
    updatedAt: now,
    updatedByEmail: actorEmail,
    notifications: {},
  };
  if (input.groupWithTreatmentStartFormId) {
    const groupPlan = (await transaction.get(db.collection(FORMS).doc(input.groupWithTreatmentStartFormId))).data();
    if (groupPlan?.formType !== "treatment_start" || groupPlan.archivedAt ||
      groupPlan.institutionId !== institutionId || typeof groupPlan.transportEventId !== "string") {
      throw new AdminRepositoryError("Choose an available pickup plan from the same institution.", 409);
    }
    id = groupPlan.transportEventId;
    const existing = eventData((await transaction.get(db.collection(EVENTS).doc(id))).data());
    if (!existing || existing.institutionId !== institutionId ||
      existing.status !== "planned" || existing.temperatureC !== -20 ||
      treatmentStart.temperatureC !== -20 || !sameSchedule(existing, schedule) ||
      (input.actorRole === "institution_doctor" && Object.values(existing.members).some(
        (entry) => entry.doctorId !== doctorId,
      ))) {
      throw new AdminRepositoryError("Grouped pickups must use the same planned frozen pickup and schedule.", 409);
    }
    if (existing.expectedCaseCount >= MAX_GROUP_SIZE) {
      throw new AdminRepositoryError("A pickup can group up to 50 cases.", 409);
    }
    event = {
      ...existing,
      ...(!existing.dispatcherEmail && input.dispatcher ? dispatcherFields(input.dispatcher) : {}),
      members: { ...existing.members, [formId]: member },
      expectedCaseCount: existing.expectedCaseCount + 1,
      updatedAt: now,
      updatedByEmail: actorEmail,
    };
  }
  validatePickupDate(event, schedule);
  event.notifications = notification(id, event, "planned");
  return {
    id,
    write() {
      transaction.set(db.collection(EVENTS).doc(id), event);
    },
  };
}

export async function prepareBiopsyPickupConfirmation(
  transaction: Transaction,
  input: {
    eventId: string;
    formId: string;
    caseId: string;
    threeLetterCode: string;
    biopsyDate: string;
    actorEmail: string;
    now: string;
  },
) {
  const reference = db.collection(EVENTS).doc(input.eventId);
  const event = eventData((await transaction.get(reference)).data());
  const member = event?.members[input.formId];
  if (!event || !member || member.removed || (member.caseId && member.caseId !== input.caseId)) {
    throw new AdminRepositoryError("The biopsy does not match its saved pickup plan.", 409);
  }
  const code = input.threeLetterCode.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(code)) {
    throw new AdminRepositoryError("A valid case code is required to confirm pickup.", 400);
  }
  validateActualBiopsyDate(event, input.biopsyDate);
  const members = {
    ...event.members,
    [input.formId]: { ...member, caseId: input.caseId, code, biopsyDate: input.biopsyDate },
  };
  const ready = Object.values(members).filter((entry) => !entry.removed && entry.caseId !== null);
  const linkedCaseIds = ready.map((entry) => entry.caseId!);
  const confirm = event.status === "planned" && ready.length === event.expectedCaseCount;
  const next: PickupEvent = {
    ...event,
    members,
    linkedCaseIds,
    linked_codes: ready.map((entry) => entry.code).join(","),
    readyCaseCount: ready.length,
    updatedAt: input.now,
    updatedByEmail: input.actorEmail,
    ...(confirm ? { status: "confirmed", confirmedAt: input.now } : {}),
  };
  if (confirm) {
    next.notifications = notification(input.eventId, next, "confirmed");
  }
  return {
    confirmedCaseIds: confirm ? linkedCaseIds : [],
    write() {
      transaction.set(reference, next);
    },
  };
}

export async function prepareTreatmentPickupCaseDetachment(
  transaction: Transaction,
  input: { eventId: string; formId: string; caseId: string; actorEmail: string; now: string },
) {
  const reference = db.collection(EVENTS).doc(input.eventId);
  const event = eventData((await transaction.get(reference)).data());
  const member = event?.members[input.formId];
  if (!event || member?.caseId !== input.caseId ||
    !["planned", "confirmed", "cancelled"].includes(event.status)) {
    return null;
  }

  const members: PickupEvent["members"] = {
    ...event.members,
    [input.formId]: { ...member, caseId: null, code: null, removed: true },
  };
  const remaining = Object.values(members).filter((entry) => !entry.removed);
  const ready = remaining.filter((entry) => entry.caseId !== null);
  const next: PickupEvent = {
    ...event,
    members,
    expectedCaseCount: remaining.length,
    readyCaseCount: ready.length,
    linkedCaseIds: ready.map((entry) => entry.caseId!),
    linked_codes: ready.map((entry) => entry.code).join(",") || null,
    status: remaining.length === 0 ? "cancelled" : event.status,
    updatedAt: input.now,
    updatedByEmail: input.actorEmail,
  };
  if (event.status !== "cancelled") {
    const kind = next.status === "cancelled" ? "cancelled" : "rescheduled";
    next.notifications = notification(input.eventId, next, kind);
    next.latestEmailKind = kind;
  }
  return {
    id: input.eventId,
    write() {
      transaction.set(reference, next);
    },
  };
}

export async function deliverTreatmentPickupNotifications(id: string) {
  const reference = db.collection(EVENTS).doc(id);
  for (const kind of EMAIL_KINDS) {
    try {
      const claimed = await db.runTransaction(async (transaction) => {
        const event = eventData((await transaction.get(reference)).data());
        const message = event?.notifications[kind];
        if (!event?.dispatcherEmail || !message || message.state === "sent" ||
          (message.state === "sending" && (message.leaseUntil ?? 0) > Date.now())) {
          return null;
        }
        const claim = randomUUID();
        transaction.set(reference, {
          notifications: {
            [kind]: { ...message, state: "sending", claim, leaseUntil: Date.now() + EMAIL_LEASE_MS },
          },
        }, { merge: true });
        return {
          claim,
          message,
          recipient: { email: event.dispatcherEmail, displayName: event.dispatcherDisplayName ?? undefined },
        };
      });
      if (!claimed) continue;

      let delivery: Pick<Notification, "state" | "sentAt" | "failedAt">;
      try {
        await sendTreatmentPickupEmail(kind, claimed.recipient, claimed.message.details);
        delivery = { state: "sent", sentAt: new Date().toISOString() };
      } catch {
        delivery = { state: "failed", failedAt: new Date().toISOString() };
      }
      await db.runTransaction(async (transaction) => {
        const event = eventData((await transaction.get(reference)).data());
        const current = event?.notifications[kind];
        if (current?.claim !== claimed.claim || current.id !== claimed.message.id) return;
        transaction.set(reference, {
          notifications: { [kind]: { ...current, ...delivery, leaseUntil: 0 } },
        }, { merge: true });
      });
    } catch (error) {
      console.error("Unable to process 2PQ pickup notification", { id, kind, error });
    }
  }
}

export async function updateTreatmentPickupForContext(
  context: AdminContext,
  formId: string,
  payload: TreatmentPickupMutation,
  dispatcher?: Dispatcher | null,
) {
  const { id, changedCases } = await db.runTransaction(async (transaction) => {
    const form = (await transaction.get(db.collection(FORMS).doc(formId))).data();
    if (!form || !["treatment_start", "sample"].includes(form.formType) ||
      typeof form.transportEventId !== "string") {
      throw new AdminRepositoryError("Pickup plan not found.", 404);
    }
    const treatmentId = form.formType === "treatment_start" ? formId : form.linkedTreatmentStartFormId;
    const reference = db.collection(EVENTS).doc(form.transportEventId);
    const event = eventData((await transaction.get(reference)).data());
    if (!event || !event.members[treatmentId] || event.institutionId !== form.institutionId ||
      !canManagePickup(context, event)) {
      throw new AdminRepositoryError("You cannot manage this pickup plan.", 403);
    }
    if (payload.action === "retry_notifications") {
      if (!event.dispatcherEmail && dispatcher) {
        transaction.set(reference, dispatcherFields(dispatcher), { merge: true });
      }
      return { id: reference.id, changedCases: [] };
    }
    if (!["planned", "confirmed", "cancelled"].includes(event.status)) {
      throw new AdminRepositoryError("Only pickups before collection can be changed.", 409);
    }
    if (payload.action === "cancel" && event.status === "cancelled") {
      return { id: reference.id, changedCases: [] };
    }
    const plans = await Promise.all(Object.keys(event.members).map(async (planId) =>
      (await transaction.get(db.collection(FORMS).doc(planId))).data(),
    ));
    await Promise.all(plans.map(async (plan) => {
      if (!plan || plan.transportEventId !== reference.id || typeof plan.linkedStudyRequestFormId !== "string") {
        throw new AdminRepositoryError("A grouped treatment form is no longer linked to this pickup.", 409);
      }
      const request = (await transaction.get(db.collection(FORMS).doc(plan.linkedStudyRequestFormId))).data();
      if (request?.linkedBiopsyForm && plan.linkedBiopsyForm !== request.linkedBiopsyForm) {
        throw new AdminRepositoryError("A biopsy is being saved for this pickup. Try again after it finishes.", 409);
      }
    }));
    const now = new Date().toISOString();
    const next = { ...event, updatedAt: now, updatedByEmail: context.email };
    let emailKind: TreatmentPickupEmailKind;
    if (payload.action === "reschedule") {
      if (event.expectedCaseCount === 0) {
        throw new AdminRepositoryError("This pickup has no linked cases to schedule.", 409);
      }
      const schedule = pickupSchedule(payload, event.origin);
      if (event.temperatureC === 4) {
        const memberId = event.sourceFormId;
        const member = event.members[memberId];
        if (member && !member.caseId) {
          if (schedule.pickupDate <= member.treatmentDate) {
            throw new AdminRepositoryError("The estimated biopsy and pickup must be after treatment start.", 400);
          }
          next.members = {
            ...event.members,
            [memberId]: { ...member, estimatedBiopsyDate: schedule.pickupDate },
          };
        }
      }
      validatePickupDate(next, schedule);
      if (event.status !== "cancelled" && sameSchedule(event, schedule)) {
        return { id: reference.id, changedCases: [] };
      }
      Object.assign(next, schedule);
      if (event.status === "cancelled") {
        next.status = "planned";
        if (next.readyCaseCount === next.expectedCaseCount) {
          next.status = "confirmed";
          next.confirmedAt = now;
        }
      }
      emailKind = next.status === "confirmed" && !event.notifications.confirmed ? "confirmed" : "rescheduled";
    } else {
      next.status = "cancelled";
      emailKind = "cancelled";
    }
    next.notifications = notification(reference.id, next, emailKind);
    next.latestEmailKind = emailKind;
    const nextCaseStatus =
      event.status !== "confirmed" && next.status === "confirmed" ? "awaiting_pick_up" :
      event.status === "confirmed" && next.status === "cancelled" ? "intake" : null;
    const changedCases: { caseId: string; previousCaseStatus: string; nextCaseStatus: string }[] = [];
    if (nextCaseStatus) {
      const previousCaseStatus = nextCaseStatus === "intake" ? "awaiting_pick_up" : "intake";
      const cases = await Promise.all(event.linkedCaseIds.map((caseId) =>
        transaction.get(db.collection(CASES).doc(caseId)),
      ));
      for (const snapshot of cases) {
        const linkedCase = snapshot.data();
        if (linkedCase?.transportEventId === reference.id && linkedCase.caseStatus === previousCaseStatus) {
          transaction.set(snapshot.ref, {
            caseStatus: nextCaseStatus,
            last_updated_date: now,
            updatedAt: now,
            updatedByEmail: context.email,
          }, { merge: true });
          changedCases.push({ caseId: snapshot.id, previousCaseStatus, nextCaseStatus });
        }
      }
    }
    transaction.set(reference, next);
    return { id: reference.id, changedCases };
  });
  if (changedCases.length) {
    try {
      for (const change of changedCases) {
        await cascadeTwoPQCaseStatusToSamplingChildren({ ...change, actorEmail: context.email });
      }
      await synchronizeTwoPQCasesFilesAndCodes(changedCases.map(({ caseId }) => caseId), context.email);
    } catch (error) {
      console.error("Unable to synchronize cases after pickup update", { id, error });
    }
  }
  await deliverTreatmentPickupNotifications(id);
  const result = await getTreatmentPickupSummary(id, context);
  if (!result) throw new AdminRepositoryError("Pickup plan not found.", 404);
  return result;
}
