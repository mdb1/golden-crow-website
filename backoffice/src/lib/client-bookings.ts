export interface ClientBookingRecord {
  id: string;
  schemaVersion: number;
  status: string;
  ack: boolean;
  acknowledgedAt?: string;
  acknowledgedBy?: string;
  archived: boolean;
  archivedAt?: string;
  archivedBy?: string;
  source: {
    context: string;
    locale: string;
    pageUrl?: string;
    path?: string;
    referrer?: string;
    origin?: string | null;
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
    startsAtTimestamp?: string;
    endsAtTimestamp?: string;
  };
  form: {
    fullName: string;
    email: string;
    whatsapp: string;
    companyName: string;
  };
  createdAt?: string;
  updatedAt?: string;
}

export interface ClientBookingsResponse {
  bookings: ClientBookingRecord[];
  nextCursor?: string;
}
