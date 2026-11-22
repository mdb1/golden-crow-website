import { createHash, randomUUID } from "node:crypto";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { AdminRepositoryError } from "./admin-errors.js";
import { adminDbFor } from "../config/firebase.js";
import {
  CLIENT_BOOKING_TIMEZONE,
  clientBookingSlotEvent,
  clientBookingSlotTimes,
  isClientBookingDateAvailable,
  isSupportBookingReason,
  type SupportBookingReason,
} from "../lib/client-booking-schedule.js";
import {
  createClientBookingGoogleCalendarEvent,
  type ClientBookingGoogleCalendarEvent,
} from "../lib/client-booking-google-calendar.js";
import type { AdminContext } from "../types/sdk.types.js";

const adminDb = adminDbFor("mydnamap");
const CLIENT_BOOKINGS_COLLECTION = "client_bookings";
const CLIENT_BOOKING_SLOTS_COLLECTION = "client_booking_slots";
const CLIENT_BOOKING_PUBLISHERS_COLLECTION = "client_booking_publishers";
const DEFAULT_LIST_LIMIT = 20;
const MAX_LIST_LIMIT = 100;
const DEFAULT_CALENDAR_LIMIT = 500;
const MAX_CALENDAR_LIMIT = 500;
const FILTERED_LIST_BATCH_LIMIT = 100;
const MAX_FILTERED_LIST_SCAN = 500;
const MAX_BOOKING_OCCUPANCY_READ = 500;

type ClientBookingKind = "consultation" | "publisher_support" | "public_support";

export interface ClientBookingInput {
  kind?: ClientBookingKind;
  reason?: SupportBookingReason;
  source: {
    context: string;
    locale: string;
    pageUrl?: string;
    path?: string;
    referrer?: string;
  };
  event: {
    title: string;
    durationMinutes: number;
    timezone: string;
    timezoneLabel: string;
    date: string;
    startTime: string;
    endTime: string;
    startsAt: string;
    endsAt: string;
  };
  form: {
    fullName: string;
    email: string;
    whatsapp: string;
    companyName: string;
  };
}

export interface ClientBookingRequestMeta {
  origin?: string;
  publisherUid?: string;
}

export type ClientBookingWebhookNotification =
  | {
      status: "delivered";
      method: "GET";
      statusCode: number;
      statusText: string;
    }
  | {
      status: "failed";
      method: "GET";
      statusCode?: number;
      statusText?: string;
      error?: string;
    }
  | {
      status: "skipped";
      reason: "not_configured";
    };

export interface ClientBookingRecord extends ClientBookingInput {
  id: string;
  kind: ClientBookingKind;
  schemaVersion: number;
  status: string;
  ack: boolean;
  acknowledgedAt?: string;
  acknowledgedBy?: string;
  archived: boolean;
  archivedAt?: string;
  archivedBy?: string;
  source: ClientBookingInput["source"] & {
    origin?: string | null;
  };
  event: ClientBookingInput["event"] & {
    startsAtTimestamp?: string;
    endsAtTimestamp?: string;
  };
  createdAt?: string;
  updatedAt?: string;
  googleCalendar?: ClientBookingGoogleCalendarEvent;
  emailNotification?: ClientBookingEmailNotification;
}

export interface ClientBookingsPage {
  bookings: ClientBookingRecord[];
  nextCursor?: string;
}

type ClientBookingEmailStatus = "delivered" | "failed" | "unknown";
export interface ClientBookingEmailNotification {
  host?: ClientBookingEmailStatus;
  attendee?: ClientBookingEmailStatus;
}

function bookingCollection() {
  return adminDb.collection(CLIENT_BOOKINGS_COLLECTION);
}

function publisherBookingCollection(uid: string) {
  const ownerKey = createHash("sha256").update(uid).digest("hex");
  return adminDb.collection(CLIENT_BOOKING_PUBLISHERS_COLLECTION)
    .doc(ownerKey).collection("bookings");
}

function occupiedInterval(data: Record<string, unknown>) {
  const event = normalizeRecord(data.event);
  const startsAt = timestampToIso(event.startsAtTimestamp) ?? normalizeString(event.startsAt);
  const endsAt = timestampToIso(event.endsAtTimestamp) ?? normalizeString(event.endsAt);
  if (!startsAt || !endsAt) return undefined;
  const start = Date.parse(startsAt);
  const end = Date.parse(endsAt);
  return end > start ? { start, end } : undefined;
}

function overlapsBooking(
  interval: NonNullable<ReturnType<typeof occupiedInterval>>,
  event: Pick<ClientBookingInput["event"], "startsAt" | "endsAt">,
) {
  return interval.start < Date.parse(event.endsAt) && interval.end > Date.parse(event.startsAt);
}

function occupiedIntervals(docs: readonly FirebaseFirestore.QueryDocumentSnapshot[]) {
  const intervals = new Map<string, NonNullable<ReturnType<typeof occupiedInterval>>[]>();
  for (const doc of docs) {
    const data = doc.data();
    const date = normalizeString(normalizeRecord(data.event).date);
    const interval = occupiedInterval(data);
    if (!interval || !date) continue;
    const day = intervals.get(date) ?? [];
    day.push(interval);
    intervals.set(date, day);
  }
  return intervals;
}

export async function listClientBookingAvailability(month: string, context: string, path?: string) {
  const slotsByDate: Record<string, string[]> = {};
  const result = { month, timezone: CLIENT_BOOKING_TIMEZONE, slotsByDate };
  const range = getMonthRange(month);
  if (!range) throw new AdminRepositoryError("Choose a valid month", 400);

  const days = Array.from({ length: Number(range.lastDate.slice(-2)) }, (_, index) =>
    `${month}-${String(index + 1).padStart(2, "0")}`,
  ).filter((date) => isClientBookingDateAvailable(date));
  if (!days.length) return result;

  const snapshot = await bookingCollection()
    .where("event.date", ">=", range.firstDate)
    .where("event.date", "<=", range.lastDate)
    .select("event")
    .limit(MAX_BOOKING_OCCUPANCY_READ + 1)
    .get();
  if (snapshot.size > MAX_BOOKING_OCCUPANCY_READ) {
    throw new AdminRepositoryError("Availability is temporarily unavailable", 503);
  }

  const intervals = occupiedIntervals(snapshot.docs);
  for (const date of days) {
    const day = intervals.get(date) ?? [];
    slotsByDate[date] = clientBookingSlotTimes(date, context, path).filter((time) => {
      const event = clientBookingSlotEvent(date, time);
      return !day.some((interval) => overlapsBooking(interval, event));
    });
  }
  return result;
}

export async function createClientBooking(
  input: ClientBookingInput,
  meta: ClientBookingRequestMeta,
): Promise<{ id: string }> {
  const { date, startTime } = input.event;
  if (!isClientBookingDateAvailable(date) ||
      !clientBookingSlotTimes(date, input.source.context, input.source.path).includes(startTime)) {
    throw new AdminRepositoryError("This slot is unavailable. Choose another time.", 409);
  }
  const event = clientBookingSlotEvent(date, startTime);
  const ref = bookingCollection().doc();
  const slotKey = `${date}_${startTime.replace(":", "")}`;
  const slotRef = adminDb.collection(CLIENT_BOOKING_SLOTS_COLLECTION).doc(slotKey);
  const dayQuery = bookingCollection().where("event.date", "==", date)
    .select("event").limit(MAX_BOOKING_OCCUPANCY_READ + 1);

  await adminDb.runTransaction(async (transaction) => {
    const [slot, day] = await Promise.all([transaction.get(slotRef), transaction.get(dayQuery)]);
    if (day.size > MAX_BOOKING_OCCUPANCY_READ) {
      throw new AdminRepositoryError("Availability is temporarily unavailable", 503);
    }
    const intervals = occupiedIntervals(day.docs).get(date) ?? [];
    if (slot.exists || intervals.some((interval) => overlapsBooking(interval, event))) {
      throw new AdminRepositoryError("This slot is unavailable. Choose another time.", 409);
    }

    const { context, locale, pageUrl, path, referrer } = input.source;
    const createdAt = FieldValue.serverTimestamp();
    transaction.create(ref, {
      schemaVersion: 1,
      kind: input.kind ?? "consultation",
      ...(input.reason ? { reason: input.reason } : {}),
      ...(meta.publisherUid ? { publisherUid: meta.publisherUid } : {}),
      status: "new",
      ack: false,
      archived: false,
      source: {
        context,
        locale,
        ...(pageUrl ? { pageUrl } : {}),
        ...(path ? { path } : {}),
        ...(referrer ? { referrer } : {}),
        origin: meta.origin ?? null,
      },
      event: {
        title: input.event.title,
        ...event,
        startsAtTimestamp: Timestamp.fromDate(new Date(event.startsAt)),
        endsAtTimestamp: Timestamp.fromDate(new Date(event.endsAt)),
      },
      form: input.form,
      createdAt,
      updatedAt: createdAt,
    });
    transaction.create(slotRef, { bookingId: ref.id });
    if (meta.publisherUid) {
      transaction.create(publisherBookingCollection(meta.publisherUid).doc(ref.id), { createdAt });
    }
  });

  return { id: ref.id };
}

export async function recordClientBookingEmailNotification(
  bookingId: string,
  notification: ClientBookingEmailNotification,
): Promise<void> {
  await bookingCollection().doc(bookingId).update({
    "notifications.email": { ...notification, updatedAt: FieldValue.serverTimestamp() },
    updatedAt: FieldValue.serverTimestamp(),
  });
}

export async function recordClientBookingWebhookNotification(
  bookingId: string,
  notification: ClientBookingWebhookNotification,
): Promise<void> {
  await adminDb
    .collection(CLIENT_BOOKINGS_COLLECTION)
    .doc(bookingId)
    .set(
      {
        notifications: {
          webhook: {
            ...notification,
            updatedAt: FieldValue.serverTimestamp(),
          },
        },
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
}

function normalizeLimit(
  limit: number | undefined,
  fallback: number,
  max: number,
) {
  if (!Number.isFinite(limit ?? NaN)) {
    return fallback;
  }

  return Math.min(Math.max(Math.trunc(limit ?? fallback), 1), max);
}

function normalizeString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function normalizeNumber(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function normalizeRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function timestampToIso(value: unknown): string | undefined {
  if (value instanceof Timestamp) {
    return value.toDate().toISOString();
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? undefined : new Date(parsed).toISOString();
  }

  return undefined;
}

function parseCursorTimestamp(cursor?: string) {
  if (!cursor) {
    return undefined;
  }

  const parsed = new Date(cursor);
  if (Number.isNaN(parsed.getTime())) {
    return undefined;
  }

  return Timestamp.fromDate(parsed);
}

function lastDayOfMonth(year: number, monthNumber: number) {
  return new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
}

function getMonthRange(month: string) {
  const [yearToken, monthToken] = month.split("-");
  const year = Number(yearToken);
  const monthNumber = Number(monthToken);

  if (
    !Number.isInteger(year) ||
    !Number.isInteger(monthNumber) ||
    monthNumber < 1 ||
    monthNumber > 12
  ) {
    return null;
  }

  const firstDate = `${yearToken}-${monthToken}-01`;
  const lastDate = `${yearToken}-${monthToken}-${String(
    lastDayOfMonth(year, monthNumber),
  ).padStart(2, "0")}`;

  return { firstDate, lastDate };
}

function googleCalendarEvent(value: unknown): ClientBookingGoogleCalendarEvent | undefined {
  const record = normalizeRecord(value);
  const eventId = normalizeString(record.eventId);
  const htmlLink = normalizeString(record.htmlLink);
  const meetLink = normalizeString(record.meetLink);
  if (!eventId || !htmlLink) return undefined;
  return { eventId, htmlLink, ...(meetLink ? { meetLink } : {}) };
}

function notificationStatus(value: unknown): ClientBookingEmailStatus | undefined {
  return value === "delivered" || value === "failed" || value === "unknown" ? value : undefined;
}

function toClientBookingRecord(
  id: string,
  data: Record<string, unknown>,
): ClientBookingRecord {
  const source = normalizeRecord(data.source);
  const event = normalizeRecord(data.event);
  const form = normalizeRecord(data.form);
  const email = normalizeRecord(normalizeRecord(data.notifications).email);
  const host = notificationStatus(email.host);
  const attendee = notificationStatus(email.attendee);
  const startsAt =
    normalizeString(event.startsAt) ??
    timestampToIso(event.startsAtTimestamp) ??
    "";
  const endsAt =
    normalizeString(event.endsAt) ??
    timestampToIso(event.endsAtTimestamp) ??
    "";

  return {
    id,
    kind: data.kind === "publisher_support" || data.kind === "public_support" ? data.kind : "consultation",
    reason: isSupportBookingReason(data.reason) ? data.reason : undefined,
    schemaVersion: normalizeNumber(data.schemaVersion, 1),
    status: normalizeString(data.status) ?? "new",
    ack: data.ack === true,
    acknowledgedAt: timestampToIso(data.acknowledgedAt),
    acknowledgedBy: normalizeString(data.acknowledgedBy),
    archived: data.archived === true,
    archivedAt: timestampToIso(data.archivedAt),
    archivedBy: normalizeString(data.archivedBy),
    source: {
      context: normalizeString(source.context) ?? "unknown",
      locale: normalizeString(source.locale) ?? "unknown",
      pageUrl: normalizeString(source.pageUrl),
      path: normalizeString(source.path),
      referrer: normalizeString(source.referrer),
      origin: normalizeString(source.origin) ?? null,
    },
    event: {
      title: normalizeString(event.title) ?? "Consultation call",
      durationMinutes: normalizeNumber(event.durationMinutes, 30),
      timezone: normalizeString(event.timezone) ?? "America/Buenos_Aires",
      timezoneLabel:
        normalizeString(event.timezoneLabel) ??
        "GMT-03:00 America/Buenos_Aires (GMT-3)",
      date:
        normalizeString(event.date) ?? (startsAt ? startsAt.slice(0, 10) : ""),
      startTime: normalizeString(event.startTime) ?? "",
      endTime: normalizeString(event.endTime) ?? "",
      startsAt,
      endsAt,
      startsAtTimestamp: timestampToIso(event.startsAtTimestamp),
      endsAtTimestamp: timestampToIso(event.endsAtTimestamp),
    },
    form: {
      fullName: normalizeString(form.fullName) ?? "",
      email: normalizeString(form.email) ?? "",
      whatsapp: normalizeString(form.whatsapp) ?? "",
      companyName: normalizeString(form.companyName) ?? "",
    },
    createdAt: timestampToIso(data.createdAt),
    updatedAt: timestampToIso(data.updatedAt),
    googleCalendar: googleCalendarEvent(data.googleCalendar),
    emailNotification: host || attendee ? { host, attendee } : undefined,
  };
}

export function publisherBookingScope(context: AdminContext) {
  if (!context.canAccessPublisherPortal || !context.uid.trim()) return undefined;
  if (context.role === "organization_publisher" && context.organizationId?.trim()) {
    return { collection: "feed_organizations", id: context.organizationId.trim() };
  }
  if (context.role === "individual_publisher" && context.individualId?.trim()) {
    return { collection: "feed_individuals", id: context.individualId.trim() };
  }
  return undefined;
}

export async function getPublisherBookingContact(context: AdminContext) {
  const scope = publisherBookingScope(context);
  if (!scope) throw new AdminRepositoryError("Publisher portal access required", 403);

  const [publisher, profile] = await Promise.all([
    adminDb.collection(scope.collection).doc(scope.id).get(),
    adminDb.collection("public_profiles").doc(context.uid).get(),
  ]);
  if (!publisher.exists) throw new AdminRepositoryError("Publisher record not found", 404);

  const publisherName = normalizeString(publisher.get("name"));
  const profileName = normalizeString(profile.get("fullName"));
  const email = context.email.trim().toLowerCase();
  return {
    fullName: (profileName ?? publisherName ?? email).slice(0, 120),
    email,
    companyName: scope.collection === "feed_organizations" ? publisherName?.slice(0, 160) ?? "" : "",
  };
}

export async function listPublisherBookingsPage(
  uid: string,
  options: { limit?: number; cursor?: string },
) {
  const limit = normalizeLimit(options.limit, DEFAULT_LIST_LIMIT, MAX_LIST_LIMIT);
  const collection = publisherBookingCollection(uid);
  let query = collection.orderBy("createdAt", "desc");

  if (options.cursor) {
    const cursor = await collection.doc(options.cursor).get();
    if (!cursor.exists) throw new AdminRepositoryError("Invalid booking cursor", 400);
    query = query.startAfter(cursor);
  }

  const snapshot = await query.limit(limit + 1).get();
  const visible = snapshot.docs.slice(0, limit);
  const bookings = [];
  if (visible.length) {
    const documents = await adminDb.getAll(...visible.map((doc) => bookingCollection().doc(doc.id)));
    const records = new Map(documents.map((doc) => [doc.id, doc.data()]));
    for (const doc of visible) {
      const data = records.get(doc.id);
      if (data?.publisherUid !== uid || data.kind !== "publisher_support") continue;
      const record = toClientBookingRecord(doc.id, data);
      bookings.push({
        id: record.id,
        kind: record.kind,
        reason: record.reason,
        event: record.event,
        status: record.status,
        createdAt: record.createdAt,
        googleCalendar: record.googleCalendar ? { meetLink: record.googleCalendar.meetLink } : undefined,
      });
    }
  }

  return { bookings, nextCursor: snapshot.size > limit ? visible.at(-1)?.id : undefined };
}

export async function convertClientBookingToGoogleCalendar(bookingId: string): Promise<ClientBookingRecord> {
  const ref = bookingCollection().doc(bookingId);
  const operationId = randomUUID();
  const booking = await adminDb.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const data = snapshot.data();
    if (!data) throw new AdminRepositoryError("Client booking not found", 404);

    const record = toClientBookingRecord(bookingId, data);
    if (record.googleCalendar) return record;

    const now = Date.now();
    if (normalizeNumber(normalizeRecord(data.googleCalendarConversion).expiresAt, 0) > now) {
      throw new AdminRepositoryError("Google Calendar booking is already being created", 409);
    }
    transaction.update(ref, { googleCalendarConversion: { operationId, expiresAt: now + 45_000 } });
    return record;
  });
  if (booking.googleCalendar) return booking;

  try {
    const event = await createClientBookingGoogleCalendarEvent(booking);
    return await adminDb.runTransaction(async (transaction) => {
      const data = (await transaction.get(ref)).data();
      if (!data) throw new AdminRepositoryError("Client booking not found", 404);
      const stored = googleCalendarEvent(data.googleCalendar);
      if (stored) return toClientBookingRecord(bookingId, data);
      if (normalizeRecord(data.googleCalendarConversion).operationId !== operationId) {
        throw new AdminRepositoryError("Google Calendar booking is already being created", 409);
      }
      transaction.update(ref, {
        googleCalendar: event,
        googleCalendarConversion: FieldValue.delete(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      return toClientBookingRecord(bookingId, { ...data, googleCalendar: event });
    });
  } catch (error) {
    await adminDb.runTransaction(async (transaction) => {
      const data = (await transaction.get(ref)).data();
      if (normalizeRecord(data?.googleCalendarConversion).operationId === operationId) {
        transaction.update(ref, { googleCalendarConversion: FieldValue.delete() });
      }
    }).catch(() => undefined);
    throw error;
  }
}

function sortBookingsByEventTime(bookings: ClientBookingRecord[]) {
  return bookings.sort((left, right) => {
    const dateCompare = left.event.date.localeCompare(right.event.date);
    if (dateCompare !== 0) {
      return dateCompare;
    }

    return left.event.startTime.localeCompare(right.event.startTime);
  });
}

export async function listClientBookingsForCalendarMonth(options: {
  month: string;
  limit?: number;
  archived?: boolean;
}): Promise<ClientBookingsPage> {
  const range = getMonthRange(options.month);
  if (!range) {
    return { bookings: [] };
  }

  const limit = normalizeLimit(
    options.limit,
    DEFAULT_CALENDAR_LIMIT,
    MAX_CALENDAR_LIMIT,
  );
  const snapshot = await adminDb
    .collection(CLIENT_BOOKINGS_COLLECTION)
    .where("event.date", ">=", range.firstDate)
    .where("event.date", "<=", range.lastDate)
    .orderBy("event.date", "asc")
    .limit(limit)
    .get();

  return {
    bookings: sortBookingsByEventTime(
      snapshot.docs
        .map((doc) => toClientBookingRecord(doc.id, doc.data()))
        .filter((booking) =>
          options.archived === undefined
            ? true
            : booking.archived === options.archived,
        ),
    ),
  };
}

export async function listClientBookingsPage(options: {
  limit?: number;
  cursor?: string;
  ack?: boolean;
  archived?: boolean;
}): Promise<ClientBookingsPage> {
  const limit = normalizeLimit(
    options.limit,
    DEFAULT_LIST_LIMIT,
    MAX_LIST_LIMIT,
  );
  const cursorTimestamp = parseCursorTimestamp(options.cursor);
  const baseQuery = adminDb
    .collection(CLIENT_BOOKINGS_COLLECTION)
    .orderBy("createdAt", "desc");
  let query = baseQuery;

  if (cursorTimestamp) {
    query = query.startAfter(cursorTimestamp);
  }

  if (options.ack !== undefined || options.archived !== undefined) {
    const bookings: ClientBookingRecord[] = [];
    let pageCursorTimestamp = cursorTimestamp;
    let scannedDocs = 0;
    let nextCursor: string | undefined;

    while (bookings.length < limit && scannedDocs < MAX_FILTERED_LIST_SCAN) {
      const batchLimit = Math.min(
        FILTERED_LIST_BATCH_LIMIT,
        MAX_FILTERED_LIST_SCAN - scannedDocs,
      );
      let batchQuery = baseQuery;

      if (pageCursorTimestamp) {
        batchQuery = batchQuery.startAfter(pageCursorTimestamp);
      }

      const snapshot = await batchQuery.limit(batchLimit).get();
      if (snapshot.empty) {
        nextCursor = undefined;
        break;
      }

      let lastConsumedDoc: (typeof snapshot.docs)[number] | undefined;

      for (const doc of snapshot.docs) {
        lastConsumedDoc = doc;
        scannedDocs += 1;

        const booking = toClientBookingRecord(doc.id, doc.data());
        const matchesAck =
          options.ack === undefined || booking.ack === options.ack;
        const matchesArchived =
          options.archived === undefined ||
          booking.archived === options.archived;

        if (matchesAck && matchesArchived) {
          bookings.push(booking);
          if (bookings.length >= limit) {
            break;
          }
        }

        if (scannedDocs >= MAX_FILTERED_LIST_SCAN) {
          break;
        }
      }

      if (!lastConsumedDoc) {
        nextCursor = undefined;
        break;
      }

      nextCursor = timestampToIso(lastConsumedDoc.data().createdAt);
      const consumedWholeBatch =
        lastConsumedDoc.id === snapshot.docs[snapshot.docs.length - 1]?.id;

      if (!consumedWholeBatch) {
        break;
      }

      if (snapshot.docs.length < batchLimit) {
        nextCursor = undefined;
        break;
      }

      pageCursorTimestamp = parseCursorTimestamp(nextCursor);
      if (!pageCursorTimestamp) {
        nextCursor = undefined;
        break;
      }
    }

    return {
      bookings,
      nextCursor,
    };
  }

  const snapshot = await query.limit(limit + 1).get();
  const visibleDocs = snapshot.docs.slice(0, limit);
  const bookings = visibleDocs.map((doc) =>
    toClientBookingRecord(doc.id, doc.data()),
  );
  const lastVisible = visibleDocs[visibleDocs.length - 1];
  const nextCursor =
    snapshot.docs.length > limit && lastVisible
      ? timestampToIso(lastVisible.data().createdAt)
      : undefined;

  return {
    bookings,
    nextCursor,
  };
}

export async function acknowledgeClientBooking(
  bookingId: string,
  acknowledgedBy: string,
): Promise<ClientBookingRecord> {
  const docRef = adminDb.collection(CLIENT_BOOKINGS_COLLECTION).doc(bookingId);
  const snapshot = await docRef.get();

  if (!snapshot.exists) {
    throw new AdminRepositoryError("Client booking not found", 404);
  }

  await docRef.set(
    {
      ack: true,
      acknowledgedAt: FieldValue.serverTimestamp(),
      acknowledgedBy,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  const updatedSnapshot = await docRef.get();
  return toClientBookingRecord(bookingId, updatedSnapshot.data() ?? {});
}

export async function archiveClientBooking(
  bookingId: string,
  archivedBy: string,
): Promise<ClientBookingRecord> {
  const docRef = adminDb.collection(CLIENT_BOOKINGS_COLLECTION).doc(bookingId);
  const snapshot = await docRef.get();

  if (!snapshot.exists) {
    throw new AdminRepositoryError("Client booking not found", 404);
  }

  await docRef.set(
    {
      archived: true,
      archivedAt: FieldValue.serverTimestamp(),
      archivedBy,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  const updatedSnapshot = await docRef.get();
  return toClientBookingRecord(bookingId, updatedSnapshot.data() ?? {});
}
