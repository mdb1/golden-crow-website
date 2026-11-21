import { getAdminContextOrNull } from "@/lib/admin-context-server";
import type { AdminContextRecord } from "@/lib/admin-areas";
import { loadPublisherSupportBookingsPage } from "@/lib/publisher-support-bookings-actions";
import { sdkFetchServer } from "@/lib/sdk-server";
import { getServerSession } from "@/lib/session";

jest.mock("@/lib/admin-context-server", () => ({ getAdminContextOrNull: jest.fn() }));
jest.mock("@/lib/sdk-server", () => ({ sdkFetchServer: jest.fn() }));
jest.mock("@/lib/session", () => ({ getServerSession: jest.fn() }));

const publisher = {
  uid: "signed-in-publisher",
  email: "publisher@example.com",
  role: "organization_publisher",
  organizationId: "publisher-organization",
  project: "mydnamap",
  projectAccess: ["mydnamap"],
  isBootstrap: false,
  canAccessBackoffice: false,
  canAccessPatientPortal: false,
  canAccessPGFlex: false,
  canAccessPublisherPortal: true,
} satisfies AdminContextRecord;

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(getServerSession).mockResolvedValue({
    user: { accessSurface: "publisher-portal", email: publisher.email, project: publisher.project },
    expires: "",
  });
  jest.mocked(getAdminContextOrNull).mockResolvedValue(publisher);
});

it("only accepts a cursor for the page owner's current session", async () => {
  await expect(loadPublisherSupportBookingsPage("old-publisher", "booking-1")).resolves.toBeNull();
  expect(sdkFetchServer).not.toHaveBeenCalled();
});

it("rejects a mismatched SDK session instead of loading the other publisher's records", async () => {
  jest.mocked(getAdminContextOrNull).mockResolvedValue({ ...publisher, email: "other@example.com" });
  await expect(loadPublisherSupportBookingsPage(publisher.uid, "booking-1")).resolves.toBeNull();
  expect(sdkFetchServer).not.toHaveBeenCalled();
});

it("fetches 20 records by authenticated UID and projects only attendee details", async () => {
  const meetLink = "https://meet.google.com/abc-defg-hij";
  const event = { date: "2026-11-24", startTime: "09:00", endTime: "09:30" };
  jest.mocked(sdkFetchServer).mockResolvedValue({
    bookings: [{
      id: "booking-2",
      reason: "billing",
      event: { ...event, durationMinutes: 30 },
      acknowledgedBy: "operator@example.com",
      googleCalendar: { htmlLink: "https://calendar.google.com/organizer", meetLink },
    }],
    nextCursor: "booking-3",
  });

  await expect(loadPublisherSupportBookingsPage(publisher.uid, "booking-1")).resolves.toEqual({
    bookings: [{ id: "booking-2", reason: "billing", event, googleCalendar: { meetLink } }],
    nextCursor: "booking-3",
  });
  expect(sdkFetchServer).toHaveBeenCalledWith(
    "/admin/publisher-support-bookings?limit=20&cursor=booking-1",
    { headers: { "x-expected-session-uid": publisher.uid } },
  );
});
