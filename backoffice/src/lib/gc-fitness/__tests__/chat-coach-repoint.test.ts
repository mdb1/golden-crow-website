// __tests__/chat-coach-repoint.test.ts
//
// #838 — the 1:1 chat must follow the client when a coach takes them on.
//
// These cases are all about what happens to `unreadCount`, because that is
// the half that was actually broken: `coachId` has been re-pointed by both
// alta paths since Phase 32, but the tally is a map keyed by uid, so it
// stayed with the OUTGOING coach on a doc they can no longer even read.
//
// The load-bearing assertion is `carriesTheOutgoingCoachTally`: a coach-less
// client's "Quiero entrenar con coach" message leaves `unreadCount[sales] = 1`,
// and if that 1 does not move, the adopting coach's inbox badge reads 0 on the
// very thread that caused the adoption — and their first reply then writes
// `unreadCount[them] = 0`, destroying the count before anyone saw it.

import { planChatCoachRepoint } from "../chat-coach-repoint";

const CLIENT = "client-1";
const SALES = "coach-sales";
const NEW_COACH = "coach-B";

describe("planChatCoachRepoint", () => {
  it("is a no-op when there is no chat doc yet", () => {
    expect(planChatCoachRepoint({ chat: null, nextCoachId: NEW_COACH })).toEqual({
      changed: false,
      previousCoachId: null,
      carriedUnread: 0,
      nextUnreadCount: {},
    });
  });

  it("is a no-op when the doc already names the incoming coach", () => {
    // The re-link / idempotent-resubmit shape. Rewriting the map here would
    // zero a badge the coach is actively looking at.
    const plan = planChatCoachRepoint({
      chat: {
        clientId: CLIENT,
        coachId: NEW_COACH,
        unreadCount: { [NEW_COACH]: 4, [CLIENT]: 0 },
      },
      nextCoachId: NEW_COACH,
    });
    expect(plan.changed).toBe(false);
    expect(plan.previousCoachId).toBe(NEW_COACH);
  });

  it("carries the outgoing coach's tally over and drops their slot", () => {
    // THE #838 case: the coach-request thread, adopted by a different coach.
    const plan = planChatCoachRepoint({
      chat: {
        clientId: CLIENT,
        coachId: SALES,
        unreadCount: { [SALES]: 1, [CLIENT]: 0 },
      },
      nextCoachId: NEW_COACH,
    });
    expect(plan).toEqual({
      changed: true,
      previousCoachId: SALES,
      carriedUnread: 1,
      nextUnreadCount: { [NEW_COACH]: 1, [CLIENT]: 0 },
    });
    // The dead slot is gone, not merely shadowed — otherwise a client passing
    // through N coaches accumulates N orphaned keys.
    expect(SALES in plan.nextUnreadCount).toBe(false);
  });

  it("leaves every OTHER participant's slot untouched", () => {
    const plan = planChatCoachRepoint({
      chat: {
        coachId: SALES,
        unreadCount: { [SALES]: 2, [CLIENT]: 7 },
      },
      nextCoachId: NEW_COACH,
    });
    expect(plan.nextUnreadCount[CLIENT]).toBe(7);
  });

  it("establishes a zeroed slot for the incoming coach when nothing was pending", () => {
    // Not cosmetic: `client-roster` reads `unreadCount[trainer.uid]`, so the
    // key existing at 0 is the difference between "read" and "absent".
    const plan = planChatCoachRepoint({
      chat: { coachId: SALES, unreadCount: { [CLIENT]: 3 } },
      nextCoachId: NEW_COACH,
    });
    expect(plan.changed).toBe(true);
    expect(plan.carriedUnread).toBe(0);
    expect(plan.nextUnreadCount).toEqual({ [CLIENT]: 3, [NEW_COACH]: 0 });
  });

  it("handles a doc that carries no coachId at all", () => {
    const plan = planChatCoachRepoint({
      chat: { clientId: CLIENT, unreadCount: { [CLIENT]: 1 } },
      nextCoachId: NEW_COACH,
    });
    expect(plan.changed).toBe(true);
    expect(plan.previousCoachId).toBeNull();
    expect(plan.nextUnreadCount).toEqual({ [CLIENT]: 1, [NEW_COACH]: 0 });
  });

  it("treats a blank coachId as no coach", () => {
    const plan = planChatCoachRepoint({
      chat: { coachId: "   ", unreadCount: {} },
      nextCoachId: NEW_COACH,
    });
    expect(plan.previousCoachId).toBeNull();
    expect(plan.nextUnreadCount).toEqual({ [NEW_COACH]: 0 });
  });

  it("migrates legacy flat \"unreadCount.{uid}\" fields into the canonical map", () => {
    // Docs written before 260524 carry top-level fields whose NAME literally
    // contains a dot (the set()-treats-dots-as-literal bug). Replacing the
    // nested map wholesale would otherwise silently discard the tally those
    // docs actually hold, since the readers fall back to the flat form.
    const plan = planChatCoachRepoint({
      chat: {
        coachId: SALES,
        [`unreadCount.${SALES}`]: 5,
        [`unreadCount.${CLIENT}`]: 2,
      },
      nextCoachId: NEW_COACH,
    });
    expect(plan.carriedUnread).toBe(5);
    expect(plan.nextUnreadCount).toEqual({ [NEW_COACH]: 5, [CLIENT]: 2 });
  });

  it("prefers the canonical nested value over a stale legacy flat one", () => {
    const plan = planChatCoachRepoint({
      chat: {
        coachId: SALES,
        [`unreadCount.${SALES}`]: 99,
        unreadCount: { [SALES]: 3 },
      },
      nextCoachId: NEW_COACH,
    });
    expect(plan.carriedUnread).toBe(3);
  });

  it("ignores non-numeric junk in the map", () => {
    const plan = planChatCoachRepoint({
      chat: {
        coachId: SALES,
        unreadCount: { [SALES]: "1", [CLIENT]: 2, bogus: null },
      },
      nextCoachId: NEW_COACH,
    });
    expect(plan.carriedUnread).toBe(0);
    expect(plan.nextUnreadCount).toEqual({ [CLIENT]: 2, [NEW_COACH]: 0 });
  });

  it("is a no-op when the incoming coach uid is blank", () => {
    const plan = planChatCoachRepoint({
      chat: { coachId: SALES, unreadCount: { [SALES]: 1 } },
      nextCoachId: "  ",
    });
    expect(plan.changed).toBe(false);
  });
});
