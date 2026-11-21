import { createClientBookingGoogleCalendarEvent } from "../lib/client-booking-google-calendar.js";

const booking = {
  id: "booking-001",
  event: {
    title: "Pocket Genes support",
    startsAt: "2030-01-08T13:00:00.000Z",
    endsAt: "2030-01-08T13:30:00.000Z",
    timezone: "America/Buenos_Aires",
  },
  form: { fullName: "Taylor Example", email: "taylor@example.com" },
};

const htmlLink = "https://calendar.google.com/calendar/event?eid=example";
const meetLink = "https://meet.google.com/abc-defg-hij";

describe("client booking Google Calendar conversion", () => {
  let fetchMock: jest.SpiedFunction<typeof fetch>;

  beforeEach(() => {
    jest.replaceProperty(process, "env", {
      ...process.env,
      GOOGLE_CALENDAR_CLIENT_ID: "client",
      GOOGLE_CALENDAR_CLIENT_SECRET: "secret",
      GOOGLE_CALENDAR_REFRESH_TOKEN: "refresh",
      GOOGLE_CALENDAR_ID: "",
    });
    fetchMock = jest.spyOn(globalThis, "fetch");
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("creates a real Calendar event and invites the saved booking attendee", async () => {
    process.env.GOOGLE_CALENDAR_ID = "support@group.calendar.google.com";
    fetchMock
      .mockResolvedValueOnce(Response.json({ access_token: "access" }))
      .mockImplementationOnce(async (url, options) => {
        expect(String(url)).toBe(
          "https://www.googleapis.com/calendar/v3/calendars/support%40group.calendar.google.com/events?sendUpdates=all&conferenceDataVersion=1",
        );
        expect(options?.method).toBe("POST");
        expect(options?.headers).toMatchObject({ authorization: "Bearer access" });
        const event = JSON.parse(String(options?.body));
        expect(event.id).toMatch(/^gcb[0-9a-f]{64}$/);
        expect(event).toMatchObject({
          summary: "Pocket Genes support (Taylor Example)",
          start: { dateTime: booking.event.startsAt, timeZone: "America/Buenos_Aires" },
          end: { dateTime: booking.event.endsAt, timeZone: "America/Buenos_Aires" },
          attendees: [{ email: booking.form.email, displayName: booking.form.fullName }],
          extendedProperties: { private: { clientBookingId: booking.id } },
          conferenceData: {
            createRequest: {
              requestId: event.id,
              conferenceSolutionKey: { type: "hangoutsMeet" },
            },
          },
        });
        return Response.json({ id: event.id, htmlLink, hangoutLink: meetLink });
      });

    const result = await createClientBookingGoogleCalendarEvent(booking);

    expect(result).toEqual({ eventId: expect.stringMatching(/^gcb/), htmlLink, meetLink });
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://oauth2.googleapis.com/token");
    expect(String(fetchMock.mock.calls[0]?.[1]?.body)).toBe(
      "grant_type=refresh_token&client_id=client&client_secret=secret&refresh_token=refresh",
    );
  });

  it("reuses the matching event when Google reports a duplicate", async () => {
    let eventId = "";
    fetchMock
      .mockResolvedValueOnce(Response.json({ access_token: "access" }))
      .mockImplementationOnce(async (url, options) => {
        expect(String(url)).toContain("/calendars/primary/events?");
        eventId = JSON.parse(String(options?.body)).id;
        return new Response(null, { status: 409 });
      })
      .mockImplementationOnce(async (url, options) => {
        expect(String(url)).toBe(
          `https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`,
        );
        expect(options?.method).toBe("GET");
        return Response.json({
          id: eventId,
          htmlLink,
          extendedProperties: { private: { clientBookingId: booking.id } },
        });
      });

    const result = await createClientBookingGoogleCalendarEvent(booking);

    expect(result).toEqual({ eventId, htmlLink });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("does not link a duplicate event without the matching booking marker", async () => {
    let eventId = "";
    fetchMock
      .mockResolvedValueOnce(Response.json({ access_token: "access" }))
      .mockImplementationOnce(async (_url, options) => {
        eventId = JSON.parse(String(options?.body)).id;
        return new Response(null, { status: 409 });
      })
      .mockImplementationOnce(async () => Response.json({ id: eventId, htmlLink }));

    await expect(createClientBookingGoogleCalendarEvent(booking)).rejects.toMatchObject({
      statusCode: 502,
    });
  });

  it("rejects an invalid time range before contacting Google", async () => {
    await expect(
      createClientBookingGoogleCalendarEvent({
        ...booking,
        event: { ...booking.event, endsAt: booking.event.startsAt },
      }),
    ).rejects.toMatchObject({ statusCode: 422 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns a configuration error without contacting Google for a missing credential", async () => {
    delete process.env.GOOGLE_CALENDAR_REFRESH_TOKEN;

    await expect(createClientBookingGoogleCalendarEvent(booking)).rejects.toMatchObject({
      statusCode: 503,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
