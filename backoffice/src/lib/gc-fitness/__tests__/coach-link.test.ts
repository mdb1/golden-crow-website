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
});
