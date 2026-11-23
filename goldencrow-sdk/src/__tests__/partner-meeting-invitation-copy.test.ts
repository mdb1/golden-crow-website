import { PARTNER_MEETING_TEMPLATE_VARIANTS } from "../lib/partner-email-copy.js";
import { partnerMeetingInvitationCopy } from "../lib/partner-meeting-invitation-copy.js";

const slot = { date: "2026-11-23", startTime: "09:30" };

it.each([
  ["es", "lunes, 23 de noviembre de 2026", "30 minutos"],
  ["en", "Monday, November 23, 2026", "30 minutes"],
] as const)("offers the same meeting in each %s template", (language, date, duration) => {
  const subjects = new Set<string>();
  for (const variant of PARTNER_MEETING_TEMPLATE_VARIANTS) {
    const copy = partnerMeetingInvitationCopy(language, variant, slot);
    const body = copy.paragraphs.join(" ");
    expect(body).toContain(date);
    expect(body).toContain(slot.startTime);
    expect(body).toContain("Buenos Aires (GMT−3)");
    expect(body).toContain(duration);
    expect(copy.callback?.split("?")[0]).toBe("/publisher-portal/support-bookings/new");
    const query = new URLSearchParams(copy.callback?.split("?")[1]);
    expect(Object.fromEntries(query)).toEqual(slot);
    subjects.add(copy.subject);
  }
  expect(subjects.size).toBe(18);
});

it("offers the free import to both organizations and individual partners in the appropriate terms", () => {
  const organization = partnerMeetingInvitationCopy("es", 7, slot, "organizationWithoutApp");
  const individual = partnerMeetingInvitationCopy("es", 7, slot, "individualWithoutApp");
  expect(organization.lead).toContain("sin cargo tu nómina completa de profesionales");
  expect(individual.lead).toContain("Si trabajás con una institución");
  expect(individual.lead).toContain("sin cargo toda su nómina");
});

it.each([
  ["es", ["sin cargo", "lecciones interactivas", "pacientes", "informe dinámico", "encuesta"]],
  ["en", ["for free", "interactive lessons", "patients", "dynamic report", "survey"]],
] as const)("includes the roster offer and mobile examples in the %s notification invitation", (language, features) => {
  const email = partnerMeetingInvitationCopy(language, 8, slot);
  for (const feature of features) expect(email.paragraphs.join(" ")).toContain(feature);
});

it("adapts a store launch invitation to a demo, a contracted app or a publisher without an app", () => {
  const demo = partnerMeetingInvitationCopy("en", 6, slot, "individualFreeApp");
  const contracted = partnerMeetingInvitationCopy("en", 6, slot, "contract");
  const firstLaunch = partnerMeetingInvitationCopy("en", 6, slot, "organizationWithoutApp");
  expect(demo.lead).toContain("open your demo together");
  expect(contracted.lead).toContain("first release or an update");
  expect(firstLaunch.lead).toContain("which developer account");
  expect(demo.callback).toBe(firstLaunch.callback);
  expect(contracted.callback).toBe(firstLaunch.callback);
});
