import { isSupportBookingReason } from "../lib/client-booking-schedule.js";
import { PARTNER_MEETING_TEMPLATE_VARIANTS } from "../lib/partner-email-copy.js";
import { partnerMeetingInvitationCopy } from "../lib/partner-meeting-invitation-copy.js";

const slot = { date: "2026-11-23", startTime: "09:30" };

it.each([
  ["es", "lunes, 23 de noviembre de 2026", "09:30 AM, hora de Buenos Aires", "30 minutos"],
  ["en", "Monday, November 23, 2026", "09:30 AM, Buenos Aires time", "30 minutes"],
] as const)("offers the same meeting in each %s template", (language, date, time, duration) => {
  const subjects = new Set<string>();
  const reasons = new Set<string>();
  for (const variant of PARTNER_MEETING_TEMPLATE_VARIANTS) {
    const copy = partnerMeetingInvitationCopy(language, variant, slot);
    const body = copy.paragraphs.join(" ");
    expect(body).toContain(date);
    expect(body).toContain(time);
    expect(body).not.toContain("GMT");
    expect(copy.preheader).toContain(time);
    expect(copy.preheader).not.toContain("GMT");
    expect(body).toContain(duration);
    expect(copy.callback?.split("?")[0]).toBe("/publisher-portal/support-bookings/new");
    const query = new URLSearchParams(copy.callback?.split("?")[1]);
    const category = query.get("category");
    if (!isSupportBookingReason(category)) throw new Error(`Invalid booking reason for template ${variant}`);
    expect(Object.fromEntries(query)).toEqual({ ...slot, category });
    subjects.add(copy.subject);
    reasons.add(category);
  }
  expect(subjects.size).toBe(18);
  expect(reasons.size).toBe(18);
});

it.each([
  ["11:00", "11:00 AM"],
  ["12:00", "12:00 PM"],
])("formats the Spanish meeting start %s as %s", (startTime, displayTime) => {
  const copy = partnerMeetingInvitationCopy("es", 4, { ...slot, startTime });
  expect(copy.preheader).toContain(`${displayTime}, hora de Buenos Aires`);
  const query = new URL(copy.callback!, "https://example.com").searchParams;
  expect(query.get("startTime")).toBe(startTime);
  expect(query.get("category")).toBe("first_note");
});

it("offers the free import to both organizations and individual partners in the appropriate terms", () => {
  const organization = partnerMeetingInvitationCopy("es", 7, slot, "organizationWithoutApp");
  const individual = partnerMeetingInvitationCopy("es", 7, slot, "individualWithoutApp");
  expect(organization.lead).toContain("sin cargo a todos tus profesionales");
  expect(organization.lead).toContain("a tu organización");
  expect(individual.lead).toContain("sin cargo a todos los profesionales");
  expect(individual.lead).toContain("a tu institución");
});

it.each([
  ["es", ["sin cargo", "lecciones personalizadas", "guías interactivas para pacientes", "informe dinámico", "encuesta"]],
  ["en", ["for free", "personalized lessons", "interactive patient guides", "dynamic report", "survey"]],
] as const)("includes the roster offer and mobile examples in the %s notification invitation", (language, features) => {
  const email = partnerMeetingInvitationCopy(language, 8, slot);
  for (const feature of features) expect(email.paragraphs.join(" ")).toContain(feature);
});

it("adapts a store launch invitation to a demo, a contracted app or a publisher without an app", () => {
  const demo = partnerMeetingInvitationCopy("en", 6, slot, "individualFreeApp");
  const contracted = partnerMeetingInvitationCopy("en", 6, slot, "contract");
  const firstLaunch = partnerMeetingInvitationCopy("en", 6, slot, "organizationWithoutApp");
  expect(demo.lead).toContain("review your demo");
  expect(contracted.lead).toContain("first release or an update");
  expect(firstLaunch.lead).toContain("developer accounts");
  expect(demo.callback).toBe(firstLaunch.callback);
  expect(contracted.callback).toBe(firstLaunch.callback);
  for (const category of ["individualFreeApp", "contract", "organizationWithoutApp"] as const) {
    const copy = partnerMeetingInvitationCopy("es", 6, slot, category);
    const text = [copy.subject, copy.heading, copy.lead].join(" ");
    expect(text).toMatch(/\bstores?\b/i);
    expect(text).not.toMatch(/\btiendas?\b/i);
  }
});
