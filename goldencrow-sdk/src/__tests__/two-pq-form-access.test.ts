import {
  canArchiveTwoPQForms,
  canCreateTwoPQFormType,
} from "../lib/two-pq-form-access";

describe("2PQ form creation access", () => {
  it("blocks sample forms for institution operators", () => {
    expect(canCreateTwoPQFormType("institution_operator", "sample")).toBe(false);
    expect(
      canCreateTwoPQFormType("institution_operator", "study_request"),
    ).toBe(true);
    expect(
      canCreateTwoPQFormType("institution_operator", "withdrawal_request"),
    ).toBe(true);
  });

  it("keeps sample forms available to laboratory staff and administrators", () => {
    expect(
      canCreateTwoPQFormType("institution_laboratory_staff", "sample"),
    ).toBe(true);
    expect(canCreateTwoPQFormType("institution_admin", "sample")).toBe(true);
    expect(canCreateTwoPQFormType("full_admin", "sample")).toBe(true);
  });
});

describe("2PQ form archive access", () => {
  it.each([
    "institution_doctor",
    "institution_operator",
    "institution_laboratory_staff",
  ] as const)("blocks archive access for %s", (role) => {
    expect(canArchiveTwoPQForms(role)).toBe(false);
  });

  it.each(["full_admin", "2pq_admin", "institution_admin"] as const)(
    "keeps archive access for %s",
    (role) => {
      expect(canArchiveTwoPQForms(role)).toBe(true);
    },
  );
});
