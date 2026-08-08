import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { adminDbFor } from "../config/firebase.js";

const adminDb = adminDbFor("mydnamap");
const CLIENT_BOOKINGS_COLLECTION = "client_bookings";
const DEFAULT_LIST_LIMIT = 20;
const MAX_LIST_LIMIT = 100;
const DEFAULT_CALENDAR_LIMIT = 250;
const MAX_CALENDAR_LIMIT = 500;

export interface ClientBookingInput {
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
}

export interface ClientBookingRecord extends ClientBookingInput {
  id: string;
  schemaVersion: number;
  status: string;
  source: ClientBookingInput["source"] & {
    origin?: string | null;
  };
  event: ClientBookingInput["event"] & {
    startsAtTimestamp?: string;
    endsAtTimestamp?: string;
  };
  createdAt?: string;
  updatedAt?: string;
}

export interface ClientBookingsPage {
  bookings: ClientBookingRecord[];
  nextCursor?: string;
}

export async function createClientBooking(
  input: ClientBookingInput,
  meta: ClientBookingRequestMeta
): Promise<{ id: string }> {
  const startsAt = new Date(input.event.startsAt);
  const endsAt = new Date(input.event.endsAt);

  const ref = await adminDb.collection(CLIENT_BOOKINGS_COLLECTION).add({
    schemaVersion: 1,
    status: "new",
    source: {
      ...input.source,
      origin: meta.origin ?? null,
    },
    event: {
      ...input.event,
      startsAtTimestamp: Timestamp.fromDate(startsAt),
      endsAtTimestamp: Timestamp.fromDate(endsAt),
    },
    form: input.form,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  return { id: ref.id };
}

function normalizeLimit(limit: number | undefined, fallback: number, max: number) {
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
    lastDayOfMonth(year, monthNumber)
  ).padStart(2, "0")}`;

  return { firstDate, lastDate };
}

function toClientBookingRecord(
  id: string,
  data: Record<string, unknown>
): ClientBookingRecord {
  const source = normalizeRecord(data.source);
  const event = normalizeRecord(data.event);
  const form = normalizeRecord(data.form);
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
    schemaVersion: normalizeNumber(data.schemaVersion, 1),
    status: normalizeString(data.status) ?? "new",
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
        normalizeString(event.date) ??
        (startsAt ? startsAt.slice(0, 10) : ""),
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
  };
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
}): Promise<ClientBookingsPage> {
  const range = getMonthRange(options.month);
  if (!range) {
    return { bookings: [] };
  }

  const limit = normalizeLimit(
    options.limit,
    DEFAULT_CALENDAR_LIMIT,
    MAX_CALENDAR_LIMIT
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
      snapshot.docs.map((doc) => toClientBookingRecord(doc.id, doc.data()))
    ),
  };
}

export async function listClientBookingsPage(options: {
  limit?: number;
  cursor?: string;
}): Promise<ClientBookingsPage> {
  const limit = normalizeLimit(options.limit, DEFAULT_LIST_LIMIT, MAX_LIST_LIMIT);
  const cursorTimestamp = parseCursorTimestamp(options.cursor);
  let query = adminDb
    .collection(CLIENT_BOOKINGS_COLLECTION)
    .orderBy("createdAt", "desc");

  if (cursorTimestamp) {
    query = query.startAfter(cursorTimestamp);
  }

  const snapshot = await query.limit(limit + 1).get();
  const visibleDocs = snapshot.docs.slice(0, limit);
  const bookings = visibleDocs.map((doc) =>
    toClientBookingRecord(doc.id, doc.data())
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
