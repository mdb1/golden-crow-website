import { decideLinkOutcome } from "../coach-link";

describe("decideLinkOutcome", () => {
  it("links a coach-less target (null doc)", () => {
    expect(decideLinkOutcome(null, "coachB")).toEqual({ kind: "link" });
  });

  it("treats an empty/whitespace coachId as no coach → link", () => {
    expect(decideLinkOutcome({ coachId: "" }, "coachB")).toEqual({
      kind: "link",
    });
    expect(decideLinkOutcome({ coachId: "   " }, "coachB")).toEqual({
      kind: "link",
    });
    expect(decideLinkOutcome({ coachId: null }, "coachB")).toEqual({
      kind: "link",
    });
  });

  it("returns alreadyYours when the target is already your client", () => {
    expect(decideLinkOutcome({ coachId: "coachB" }, "coachB")).toEqual({
      kind: "alreadyYours",
    });
  });

  it("links a claimable stray (autoAssignedCoach === true)", () => {
    expect(
      decideLinkOutcome(
        { coachId: "coachA", autoAssignedCoach: true },
        "coachB",
      ),
    ).toEqual({ kind: "link" });
  });

  it("returns conflict when the target has a different real coach", () => {
    expect(decideLinkOutcome({ coachId: "coachA" }, "coachB")).toEqual({
      kind: "conflict",
      currentCoachId: "coachA",
    });
  });

  it("prefers alreadyYours over stray when coachId matches the session", () => {
    expect(
      decideLinkOutcome(
        { coachId: "coachB", autoAssignedCoach: true },
        "coachB",
      ),
    ).toEqual({ kind: "alreadyYours" });
  });

  it("treats a mirror doc with a different coachId (no autoAssignedCoach) as conflict", () => {
    expect(decideLinkOutcome({ coachId: "coachA" }, "coachB")).toEqual({
      kind: "conflict",
      currentCoachId: "coachA",
    });
  });

  it("does not treat autoAssignedCoach:false as a claimable stray", () => {
    expect(
      decideLinkOutcome(
        { coachId: "coachA", autoAssignedCoach: false },
        "coachB",
      ),
    ).toEqual({ kind: "conflict", currentCoachId: "coachA" });
  });

  // CR-02 — a trainer account is never a linkable client. A trainer doc
  // usually has NO coachId, which rule (1) would classify as "link" and
  // let a coach demote another trainer (doc overwrite + claims clobber).
  it("refuses a trainer target with no coachId (the demotion vector)", () => {
    expect(decideLinkOutcome({ role: "trainer" }, "coachB")).toEqual({
      kind: "trainerTarget",
    });
  });

  it("refuses a trainer target even when a coachId is present", () => {
    expect(
      decideLinkOutcome({ role: "trainer", coachId: "coachA" }, "coachB"),
    ).toEqual({ kind: "trainerTarget" });
  });

  it("trainerTarget wins over alreadyYours and the stray rule", () => {
    expect(
      decideLinkOutcome(
        { role: "trainer", coachId: "coachB", autoAssignedCoach: true },
        "coachB",
      ),
    ).toEqual({ kind: "trainerTarget" });
  });

  it("does not refuse a client-role doc (role passthrough is trainer-only)", () => {
    expect(decideLinkOutcome({ role: "client" }, "coachB")).toEqual({
      kind: "link",
    });
  });
});
