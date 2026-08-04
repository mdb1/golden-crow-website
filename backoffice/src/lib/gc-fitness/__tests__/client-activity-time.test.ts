import {
  clientActivityGroupKey,
  formatClientActivityDate,
  formatClientActivityDateTime,
  formatClientActivityTime,
} from "@/lib/gc-fitness/client-activity-time";

/**
 * ⚠️ **Every assertion on a rendered string passes an EXPLICIT locale.**
 *
 * `Intl` with an `undefined` locale resolves to the RUNTIME's, so these tests used to assert
 * CI's `en-US` output ("Jun 2") and fail on any machine whose default is something else
 * ("2 jun") — same code, same input, different environment. It read as a flake, it got
 * documented as one ("don't chase it"), and it sat red locally for two months while staying
 * green in CI. A test nobody trusts is a test that has stopped working.
 *
 * The display helpers still resolve to the viewer's locale in production, which is what a
 * coach should see; the locale argument exists so a test can say WHICH rendering it means.
 * What these tests are actually about — that the TIMEZONE moves the instant onto the right
 * civil day and hour — is untouched by that choice.
 */
const LOCALE = "en-US";
const BUENOS_AIRES = "America/Argentina/Buenos_Aires";

describe("client activity timezone helpers", () => {
  test("formats instants in the provided timezone", () => {
    expect(
      formatClientActivityDateTime(
        "2026-06-03T14:08:00.000Z",
        BUENOS_AIRES,
        LOCALE,
      ),
    ).toContain("11:08");
  });

  test("uses the provided timezone for time-only labels", () => {
    expect(
      formatClientActivityTime("2026-06-03T14:08:00.000Z", BUENOS_AIRES, LOCALE),
    ).toContain("11:08");
  });

  test("uses the provided timezone for fallback photo dates", () => {
    expect(
      formatClientActivityDate("2026-06-03T02:59:00.000Z", BUENOS_AIRES, LOCALE),
    ).toBe("Jun 2");
  });

  test("groups messages by local day and hour rather than UTC", () => {
    expect(clientActivityGroupKey("2026-06-03T02:59:00.000Z", BUENOS_AIRES)).toBe(
      "2026-06-02T23",
    );
  });

  /**
   * The group key is a KEY, so it must not move with whoever is looking at it.
   *
   * `clientActivityGroupKey` takes no locale on purpose — it pins its own — and this is the
   * test that holds that in place. Midnight is the case that actually breaks: `hour12: false`
   * renders `24` under the `h24` cycle some locales resolve to and `00` under `h23`, which
   * would drop the same message into two different buckets for two coaches looking at the
   * same client.
   */
  test("the group key is stable at midnight regardless of the viewer's locale", () => {
    // 03:00Z on Jun 3 is exactly 00:00 on Jun 3 in Buenos Aires (UTC-3).
    expect(clientActivityGroupKey("2026-06-03T03:00:00.000Z", BUENOS_AIRES)).toBe(
      "2026-06-03T00",
    );
  });
});
