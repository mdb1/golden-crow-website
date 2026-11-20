/** @jest-environment jsdom */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { BookingCalendarAction } from "@/components/god-mode/booking-calendar-action";
import type { ClientBookingRecord } from "@/lib/client-bookings";
import { sdkFetch } from "@/lib/sdk-client";

jest.mock("@/lib/sdk-client", () => ({ sdkFetch: jest.fn() }));

const booking: ClientBookingRecord = {
  id: "booking-1",
  schemaVersion: 2,
  status: "new",
  ack: false,
  archived: false,
  kind: "publisher_support",
  reason: "publishing",
  source: { context: "pocket-genes-support", locale: "en" },
  event: {
    title: "Pocket Genes support",
    durationMinutes: 30,
    timezone: "America/Buenos_Aires",
    timezoneLabel: "Buenos Aires (GMT-3)",
    date: "2026-12-10",
    startTime: "10:00",
    endTime: "10:30",
    startsAt: "2026-12-10T13:00:00.000Z",
    endsAt: "2026-12-10T13:30:00.000Z",
  },
  form: {
    fullName: "Jules Example",
    email: "jules@example.com",
    whatsapp: "",
    companyName: "",
  },
};

const calendar = {
  eventId: "event-1",
  htmlLink: "https://calendar.google.com/calendar/event?eid=test",
  meetLink: "https://meet.google.com/abc-defg-hij",
};

function renderAction(record = booking, onCreated = jest.fn()) {
  const queryClient = new QueryClient();
  render(
    <QueryClientProvider client={queryClient}>
      <BookingCalendarAction
        booking={record}
        language="en"
        meetingTime="Thu, Dec 10, 2026 · 10:00 AM - 10:30 AM"
        onCreated={onCreated}
      />
    </QueryClientProvider>,
  );
  return onCreated;
}

beforeEach(() => jest.mocked(sdkFetch).mockReset());

it("confirms the attendee before creating a meeting and shows the resulting links", async () => {
  jest.mocked(sdkFetch).mockResolvedValue({ booking: { ...booking, googleCalendar: calendar } });
  const onCreated = renderAction();
  fireEvent.click(screen.getByRole("button", { name: "Create Google Calendar meeting" }));
  expect(screen.getByText("jules@example.com")).toBeInTheDocument();
  expect(sdkFetch).not.toHaveBeenCalled();

  fireEvent.click(screen.getByRole("button", { name: "Create and invite" }));

  expect(await screen.findByRole("link", { name: "Open Google Calendar" }))
    .toHaveAttribute("href", calendar.htmlLink);
  expect(screen.getByRole("link", { name: "Open Google Meet" }))
    .toHaveAttribute("href", calendar.meetLink);
  expect(sdkFetch).toHaveBeenCalledWith("/admin/client-bookings/booking-1/google-calendar", { method: "POST" });
  expect(onCreated).toHaveBeenCalledTimes(1);
});

it("keeps the confirmation open with the error so the operator can retry", async () => {
  jest.mocked(sdkFetch).mockRejectedValue(new Error("Google Calendar is not configured"));
  renderAction();
  fireEvent.click(screen.getByRole("button", { name: "Create Google Calendar meeting" }));
  fireEvent.click(screen.getByRole("button", { name: "Create and invite" }));

  expect(await screen.findByRole("alert")).toHaveTextContent("Google Calendar is not configured");
  await waitFor(() => expect(screen.getByRole("button", { name: "Create and invite" })).toBeEnabled());
});

it("shows the linked event for an archived booking", () => {
  renderAction({ ...booking, archived: true, googleCalendar: calendar });

  expect(screen.getByRole("link", { name: "Open Google Calendar" })).toHaveAttribute("href", calendar.htmlLink);
  expect(screen.queryByRole("button", { name: "Create Google Calendar meeting" })).not.toBeInTheDocument();
});
