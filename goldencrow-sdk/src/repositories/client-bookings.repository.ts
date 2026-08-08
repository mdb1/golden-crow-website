import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { adminDbFor } from "../config/firebase.js";

const adminDb = adminDbFor("mydnamap");
const CLIENT_BOOKINGS_COLLECTION = "client_bookings";

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
    identification: string;
    investmentReadiness: string;
    message?: string;
  };
}

export interface ClientBookingRequestMeta {
  origin?: string;
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
    form: {
      ...input.form,
      message: input.form.message ?? "",
    },
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  return { id: ref.id };
}
