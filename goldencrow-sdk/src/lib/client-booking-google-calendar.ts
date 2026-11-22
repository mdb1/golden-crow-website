import { createHash } from "node:crypto";

type CalendarBooking = {
  id: string;
  event: {
    title: string;
    startsAt: string;
    endsAt: string;
    timezone: string;
  };
  form: {
    fullName: string;
    email: string;
  };
};

export type ClientBookingGoogleCalendarEvent = {
  eventId: string;
  htmlLink: string;
  meetLink?: string;
};

type GoogleEventResponse = {
  id?: string;
  htmlLink?: string;
  hangoutLink?: string;
  status?: string;
  extendedProperties?: { private?: { clientBookingId?: string } };
  conferenceData?: {
    entryPoints?: Array<{ entryPointType?: string; uri?: string }>;
  };
};

export class ClientBookingGoogleCalendarError extends Error {
  constructor(
    message: string,
    public readonly statusCode: 422 | 502 | 503,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "ClientBookingGoogleCalendarError";
  }
}

const REQUEST_TIMEOUT_MS = 7000;

async function calendarRequest(url: URL | string, options: RequestInit) {
  try {
    return await fetch(url, {
      ...options,
      redirect: "error",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (cause) {
    throw new ClientBookingGoogleCalendarError(
      "Google Calendar could not be reached. Try again.",
      502,
      { cause },
    );
  }
}

async function getCalendarAccessToken() {
  const clientId = process.env.GOOGLE_CALENDAR_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CALENDAR_CLIENT_SECRET?.trim();
  const refreshToken = process.env.GOOGLE_CALENDAR_REFRESH_TOKEN?.trim();
  if (!clientId || !clientSecret || !refreshToken) {
    throw new ClientBookingGoogleCalendarError(
      "Google Calendar authorization has not been configured.",
      503,
    );
  }

  const response = await calendarRequest("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
    }),
  });
  const payload = (await response.json().catch(() => null)) as {
    access_token?: string;
  } | null;
  if (
    !response.ok ||
    typeof payload?.access_token !== "string" ||
    !payload.access_token
  ) {
    throw new ClientBookingGoogleCalendarError(
      "Google Calendar authorization failed. Check the connected calendar account.",
      502,
    );
  }
  return payload.access_token;
}

function calendarTimeZone(value: string) {
  try {
    return new Intl.DateTimeFormat("en", {
      timeZone: value,
    }).resolvedOptions().timeZone;
  } catch {
    return "UTC";
  }
}

function bookingEvent(booking: CalendarBooking) {
  const start = new Date(booking.event.startsAt);
  const end = new Date(booking.event.endsAt);
  const email = booking.form.email.trim();
  if (
    !Number.isFinite(start.getTime()) ||
    !Number.isFinite(end.getTime()) ||
    end <= start ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  ) {
    throw new ClientBookingGoogleCalendarError(
      "The booking needs valid meeting times and an attendee email.",
      422,
    );
  }

  const id = `gcb${createHash("sha256").update(booking.id).digest("hex")}`;
  const name = booking.form.fullName.trim();
  const timeZone = calendarTimeZone(booking.event.timezone);
  return {
    id,
    summary: name ? `${booking.event.title} (${name})` : booking.event.title,
    start: { dateTime: start.toISOString(), timeZone },
    end: { dateTime: end.toISOString(), timeZone },
    attendees: [{ email, ...(name && { displayName: name }) }],
    guestsCanInviteOthers: false,
    extendedProperties: { private: { clientBookingId: booking.id } },
    conferenceData: {
      createRequest: {
        requestId: id,
        conferenceSolutionKey: { type: "hangoutsMeet" },
      },
    },
  };
}

function getGoogleUrl(value: string | undefined, kind: "calendar" | "meet") {
  const url = value ? URL.parse(value) : null;
  if (url?.protocol !== "https:" || url.username || url.password) {
    return undefined;
  }
  if (kind === "meet") {
    return url.hostname === "meet.google.com" ? url.href : undefined;
  }
  if (
    url.hostname === "calendar.google.com" ||
    (url.hostname === "www.google.com" && url.pathname.startsWith("/calendar/"))
  ) {
    return url.href;
  }
  return undefined;
}

export async function createClientBookingGoogleCalendarEvent(
  booking: CalendarBooking,
): Promise<ClientBookingGoogleCalendarEvent> {
  const event = bookingEvent(booking);
  const token = await getCalendarAccessToken();
  const calendarId = process.env.GOOGLE_CALENDAR_ID?.trim() || "primary";
  const eventsUrl = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`;
  const insertUrl = new URL(eventsUrl);
  insertUrl.searchParams.set("sendUpdates", "all");
  insertUrl.searchParams.set("conferenceDataVersion", "1");
  const authorization = `Bearer ${token}`;
  const insert = await calendarRequest(insertUrl, {
    method: "POST",
    headers: { authorization, "content-type": "application/json" },
    body: JSON.stringify(event),
  });

  const alreadyExists = insert.status === 409;
  const response = alreadyExists
    ? await calendarRequest(`${eventsUrl}/${event.id}`, {
        method: "GET",
        headers: { authorization },
      })
    : insert;
  if (!response.ok) {
    throw new ClientBookingGoogleCalendarError(
      "Google Calendar could not create the meeting. Check calendar access and try again.",
      502,
    );
  }

  const result = (await response.json().catch(() => null)) as
    | GoogleEventResponse
    | null;
  const htmlLink = getGoogleUrl(result?.htmlLink, "calendar");
  if (
    result?.id !== event.id ||
    result.status === "cancelled" ||
    (alreadyExists &&
      result.extendedProperties?.private?.clientBookingId !== booking.id) ||
    !htmlLink
  ) {
    throw new ClientBookingGoogleCalendarError(
      "Google Calendar did not return a valid meeting for this booking.",
      502,
    );
  }
  const entryPoints = result.conferenceData?.entryPoints;
  const videoUri = Array.isArray(entryPoints)
    ? entryPoints.find((point) => point?.entryPointType === "video")?.uri
    : undefined;
  const meetLink =
    getGoogleUrl(result.hangoutLink, "meet") ?? getGoogleUrl(videoUri, "meet");
  return { eventId: event.id, htmlLink, ...(meetLink && { meetLink }) };
}
