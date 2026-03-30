import { adminDb } from "../config/firebase.js";
import { FieldValue } from "firebase-admin/firestore";
import { AdminRepositoryError } from "./admin-errors.js";
import type { BookingSlotRecord, BookingRecord } from "../types/gym.types.js";

const GYM_BOOKING_SLOTS_COLLECTION = "gym_booking_slots";
const GYM_BOOKINGS_COLLECTION = "gym_bookings";
const DEFAULT_GYM_ID = "prolife360";

function normalizeOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function normalizeTimestampToIso(value: unknown): string {
  if (
    value !== null &&
    typeof value === "object" &&
    typeof (value as { toDate?: unknown }).toDate === "function"
  ) {
    return (value as { toDate(): Date }).toDate().toISOString();
  }
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }
  return new Date().toISOString();
}

function slotsRef() {
  return adminDb
    .collection(GYM_BOOKING_SLOTS_COLLECTION)
    .doc(DEFAULT_GYM_ID)
    .collection("slots");
}

function bookingsRef() {
  return adminDb.collection(GYM_BOOKINGS_COLLECTION);
}

function toBookingSlotRecord(
  id: string,
  data: Record<string, unknown>
): BookingSlotRecord {
  return {
    id,
    gymId: normalizeOptionalString(data.gymId) ?? DEFAULT_GYM_ID,
    date: normalizeTimestampToIso(data.date),
    startTime: normalizeTimestampToIso(data.startTime),
    endTime: normalizeTimestampToIso(data.endTime),
    type: data.type === "session" ? "session" : "class",
    title: normalizeOptionalString(data.title) ?? "",
    maxCapacity: Number(data.maxCapacity ?? 0),
    currentCount: Number(data.currentCount ?? 0),
    trainerId: normalizeOptionalString(data.trainerId),
    createdAt: normalizeTimestampToIso(data.createdAt),
    updatedAt: normalizeTimestampToIso(data.updatedAt),
  };
}

function toBookingRecord(
  id: string,
  data: Record<string, unknown>
): BookingRecord {
  return {
    id,
    slotId: normalizeOptionalString(data.slotId) ?? "",
    userId: normalizeOptionalString(data.userId) ?? "",
    gymId: normalizeOptionalString(data.gymId) ?? DEFAULT_GYM_ID,
    status: data.status === "cancelled" ? "cancelled" : "confirmed",
    bookedAt: normalizeTimestampToIso(data.bookedAt),
    cancelledAt: data.cancelledAt
      ? normalizeTimestampToIso(data.cancelledAt)
      : undefined,
  };
}

// --- Booking Slot Functions (GSDK-09, GSDK-10) ---

export async function listBookingSlots(): Promise<BookingSlotRecord[]> {
  const snapshot = await slotsRef().orderBy("startTime", "asc").get();
  return snapshot.docs.map((doc) =>
    toBookingSlotRecord(doc.id, doc.data() as Record<string, unknown>)
  );
}

export async function getBookingSlot(slotId: string): Promise<BookingSlotRecord> {
  const doc = await slotsRef().doc(slotId).get();
  if (!doc.exists) {
    throw new AdminRepositoryError(`Booking slot not found: ${slotId}`, 404);
  }
  return toBookingSlotRecord(doc.id, doc.data() as Record<string, unknown>);
}

export async function createBookingSlot(data: {
  date: string;
  startTime: string;
  endTime: string;
  type: "class" | "session";
  title: string;
  maxCapacity: number;
  trainerId?: string;
}): Promise<BookingSlotRecord> {
  const docData: Record<string, unknown> = {
    gymId: DEFAULT_GYM_ID,
    date: data.date,
    startTime: data.startTime,
    endTime: data.endTime,
    type: data.type,
    title: data.title,
    maxCapacity: data.maxCapacity,
    currentCount: 0,
    trainerId: data.trainerId ?? null,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };

  const ref = await slotsRef().add(docData);
  const created = await ref.get();
  return toBookingSlotRecord(created.id, created.data() as Record<string, unknown>);
}

export async function updateBookingSlot(
  slotId: string,
  data: {
    date?: string;
    startTime?: string;
    endTime?: string;
    type?: "class" | "session";
    title?: string;
    maxCapacity?: number;
    trainerId?: string;
  }
): Promise<BookingSlotRecord> {
  const docRef = slotsRef().doc(slotId);
  const existing = await docRef.get();
  if (!existing.exists) {
    throw new AdminRepositoryError(`Booking slot not found: ${slotId}`, 404);
  }

  const updateData: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
  if (data.date !== undefined) updateData.date = data.date;
  if (data.startTime !== undefined) updateData.startTime = data.startTime;
  if (data.endTime !== undefined) updateData.endTime = data.endTime;
  if (data.type !== undefined) updateData.type = data.type;
  if (data.title !== undefined) updateData.title = data.title;
  if (data.maxCapacity !== undefined) updateData.maxCapacity = data.maxCapacity;
  if (data.trainerId !== undefined) updateData.trainerId = data.trainerId;

  await docRef.update(updateData);
  const updated = await docRef.get();
  return toBookingSlotRecord(updated.id, updated.data() as Record<string, unknown>);
}

export async function deleteBookingSlot(slotId: string): Promise<{ deleted: true }> {
  const docRef = slotsRef().doc(slotId);
  const existing = await docRef.get();
  if (!existing.exists) {
    throw new AdminRepositoryError(`Booking slot not found: ${slotId}`, 404);
  }
  await docRef.delete();
  return { deleted: true };
}

// --- Booking Functions (GSDK-11) ---

export async function listBookings(filters?: {
  userId?: string;
  status?: string;
  from?: string;
  to?: string;
}): Promise<BookingRecord[]> {
  // Fetch all bookings and apply filters in JS to avoid composite Firestore index requirements (v1)
  const snapshot = await bookingsRef().get();
  let bookings = snapshot.docs.map((doc) =>
    toBookingRecord(doc.id, doc.data() as Record<string, unknown>)
  );

  if (filters) {
    if (filters.userId) {
      bookings = bookings.filter((b) => b.userId === filters.userId);
    }
    if (filters.status) {
      bookings = bookings.filter((b) => b.status === filters.status);
    }
    if (filters.from) {
      const fromDate = new Date(filters.from);
      bookings = bookings.filter((b) => new Date(b.bookedAt) >= fromDate);
    }
    if (filters.to) {
      const toDate = new Date(filters.to);
      bookings = bookings.filter((b) => new Date(b.bookedAt) <= toDate);
    }
  }

  return bookings;
}

export async function getBooking(bookingId: string): Promise<BookingRecord> {
  const doc = await bookingsRef().doc(bookingId).get();
  if (!doc.exists) {
    throw new AdminRepositoryError(`Booking not found: ${bookingId}`, 404);
  }
  return toBookingRecord(doc.id, doc.data() as Record<string, unknown>);
}

export async function updateBookingStatus(
  bookingId: string,
  status: "confirmed" | "cancelled"
): Promise<BookingRecord> {
  const docRef = bookingsRef().doc(bookingId);
  const existing = await docRef.get();
  if (!existing.exists) {
    throw new AdminRepositoryError(`Booking not found: ${bookingId}`, 404);
  }

  const updateData: Record<string, unknown> = { status };
  if (status === "cancelled") {
    updateData.cancelledAt = FieldValue.serverTimestamp();
  }

  await docRef.update(updateData);
  const updated = await docRef.get();
  return toBookingRecord(updated.id, updated.data() as Record<string, unknown>);
}
