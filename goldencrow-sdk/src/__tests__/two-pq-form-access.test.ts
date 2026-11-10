import {
  canArchiveTwoPQForms,
  canCreateTwoPQFormType,
} from "../lib/two-pq-form-access";

describe("2PQ form creation access", () => {
  it.each(["institution_admin", "institution_operator", "institution_laboratory_staff", "full_admin", "2pq_admin"] as const)(
    "allows every form for %s so linked-request saves use the same permissions",
    (role) => {
      for (const formType of ["study_request", "sample", "withdrawal_request"] as const) {
        expect(canCreateTwoPQFormType(role, formType)).toBe(true);
      }
    },
  );
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
