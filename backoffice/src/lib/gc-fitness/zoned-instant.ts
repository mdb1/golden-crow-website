// zoned-instant.ts
//
// The one direction `civil-date.ts` deliberately does not go: a WALL CLOCK the
// coach typed ("2026-08-05" + "18:00") back to the instant it denotes in their
// IANA zone.
//
// Why it is not in civil-date.ts: that file is a locked cross-platform twin of
// CivilDate.swift / CivilDate.kt, with a source-contract test forbidding
// `toISOString`. This is backoffice-only (form input → Firestore timestamp) and
// has no mobile counterpart, so it stays out of the twin.
//
// Why it exists (#747): `new Date("2026-08-05T18:00:00")` — a date-time string
// with NO offset — is interpreted in the HOST zone, which on Vercel is UTC. A
// coach in Buenos Aires setting a checklist reminder for 18:00 stored 18:00Z
// and then read it back as 15:00. The value was never in their timezone at any
// point of the round trip.

/**
 * The offset (ms) between `timezone` and UTC AT a given instant. Positive east
 * of Greenwich. Derived by formatting the instant in the zone and reading the
 * result back as if it were UTC — the only way to get a zone's offset out of
 * `Intl` without a tz database of our own.
 */
function zoneOffsetMs(instant: Date, timezone: string): number {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      calendar: "gregory",
      // `hourCycle` rather than `hour12: false`, which leaves the 24-vs-00
      // choice at midnight to the locale.
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).formatToParts(instant);
  } catch {
    // Unknown IANA identifier — same fallback as civil-date.ts: behave as the
    // host zone rather than throwing at the caller.
    return -instant.getTimezoneOffset() * 60_000;
  }

  const at = (type: Intl.DateTimeFormatPartTypes) =>
    Number.parseInt(parts.find((p) => p.type === type)?.value ?? "0", 10);

  const asIfUTC = Date.UTC(
    at("year"),
    at("month") - 1,
    at("day"),
    at("hour"),
    at("minute"),
    at("second"),
  );
  return asIfUTC - instant.getTime();
}

/**
 * The instant at which `HH:mm` on the civil day `YYYY-MM-DD` occurs in
 * `timezone`. Returns null for a malformed date or time.
 *
 * Two passes on purpose: the first guess uses the offset in force at the
 * UTC-reading of the wall clock, which is the WRONG side of a DST transition
 * for times near the changeover. Re-reading the offset at the corrected instant
 * settles it. (For the ambiguous hour a fall-back repeats, this picks one of
 * the two — there is no right answer, only a consistent one.)
 */
export function zonedWallClockInstant(
  civilDate: string,
  time: string,
  timezone: string,
): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(civilDate)) return null;
  if (!/^\d{2}:\d{2}$/.test(time)) return null;

  const asUTC = new Date(`${civilDate}T${time}:00Z`);
  if (Number.isNaN(asUTC.getTime())) return null;

  const firstPass = new Date(asUTC.getTime() - zoneOffsetMs(asUTC, timezone));
  return new Date(asUTC.getTime() - zoneOffsetMs(firstPass, timezone));
}
