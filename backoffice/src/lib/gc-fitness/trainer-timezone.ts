import "server-only";

import { cookies } from "next/headers";

// trainer-timezone.ts — resolves the trainer's IANA timezone server-side.
//
// WHY THIS EXISTS: server code (Server Components / Server Actions) runs on
// Vercel where `Intl.DateTimeFormat().resolvedOptions().timeZone` always
// resolves to "UTC" — the server has no notion of the trainer's browser
// locale. That made the Coach Pulse dashboard roll "today" forward to the
// next UTC day for trainers in negative-offset zones (e.g. Argentina UTC-3
// at 21:43 saw tomorrow). The real browser zone is delivered to the server
// via the `gcfitness_tz` cookie written client-side by <TimezoneSync />.
//
// This helper reads + validates that cookie, falling back to "UTC" when the
// cookie is absent or carries an invalid IANA zone (so we never crash and
// never trust an attacker-supplied garbage value).

/** Cookie name shared with the client TimezoneSync component. */
export const TRAINER_TZ_COOKIE = "gcfitness_tz";

export async function getTrainerTimezone(): Promise<string> {
  // cookies() is async in Next 16.
  const store = await cookies();
  const timeZone = store.get(TRAINER_TZ_COOKIE)?.value;

  if (!timeZone) {
    return "UTC";
  }

  try {
    // An invalid IANA zone throws RangeError here; a valid one constructs fine.
    new Intl.DateTimeFormat(undefined, { timeZone });
    return timeZone;
  } catch {
    return "UTC";
  }
}
