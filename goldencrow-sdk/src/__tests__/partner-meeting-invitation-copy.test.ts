import { partnerMeetingInvitationCopy } from "../lib/partner-meeting-invitation-copy.js";

const slot = { date: "2026-11-23", startTime: "09:30" };

it.each([
  ["es", "lunes, 23 de noviembre de 2026", "30 minutos"],
  ["en", "Monday, November 23, 2026", "30 minutes"],
] as const)("offers the same meeting in each %s template", (language, date, duration) => {
  const subjects = new Set<string>();
  for (const variant of [1, 2, 3] as const) {
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
  expect(subjects.size).toBe(3);
});
