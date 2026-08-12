import {
  DEFAULT_OBSERVATIONS_VALUE,
  formatBiopsySampleIdForDisplay,
  getWithdrawalRequestTitle,
  normalizeObservationsValue,
  shouldShowAutomaticPatientPortalAccessStep,
} from "@/lib/two-pq-forms";

describe("shouldShowAutomaticPatientPortalAccessStep", () => {
  it("shows the step only when a study request creates a patient", () => {
    expect(
      shouldShowAutomaticPatientPortalAccessStep("study_request", undefined)
    ).toBe(true);
    expect(
      shouldShowAutomaticPatientPortalAccessStep("study_request", "PAT-00008")
    ).toBe(false);
    expect(
      shouldShowAutomaticPatientPortalAccessStep("sample", undefined)
    ).toBe(false);
    expect(
      shouldShowAutomaticPatientPortalAccessStep(
        "withdrawal_request",
        undefined
      )
    ).toBe(false);
  });
});

describe("normalizeObservationsValue", () => {
  it("uses the default observations text for blank values", () => {
    expect(normalizeObservationsValue("")).toBe(DEFAULT_OBSERVATIONS_VALUE);
    expect(normalizeObservationsValue("   ")).toBe(DEFAULT_OBSERVATIONS_VALUE);
    expect(normalizeObservationsValue(null)).toBe(DEFAULT_OBSERVATIONS_VALUE);
    expect(normalizeObservationsValue(undefined)).toBe(
      DEFAULT_OBSERVATIONS_VALUE
    );
  });

  it("trims entered observations", () => {
    expect(normalizeObservationsValue("  antecedente relevante  ")).toBe(
      "antecedente relevante"
    );
  });
});

describe("formatBiopsySampleIdForDisplay", () => {
  it("replaces the fourth zero in six-character biopsy sample ids with a hyphen", () => {
    expect(formatBiopsySampleIdForDisplay("CCC001")).toBe("CCC-01");
    expect(formatBiopsySampleIdForDisplay("CCC002")).toBe("CCC-02");
    expect(formatBiopsySampleIdForDisplay("CCC0CT")).toBe("CCC-CT");
    expect(formatBiopsySampleIdForDisplay("CCC0BL")).toBe("CCC-BL");
  });

  it("leaves stored sample ids that do not match the visual pattern unchanged", () => {
    expect(formatBiopsySampleIdForDisplay("CCC101")).toBe("CCC101");
    expect(formatBiopsySampleIdForDisplay("CCC01")).toBe("CCC01");
  });
});

describe("getWithdrawalRequestTitle", () => {
  it("formats one linked case in Spanish", () => {
    expect(
      getWithdrawalRequestTitle(
        {
          linkedCaseIds: [],
          withdrawalCases: [{ three_letter_code: "abc" }],
        },
        "es"
      )
    ).toBe("Solicitud de retiro de ABC");
  });

  it("formats two linked cases in Spanish", () => {
    expect(
      getWithdrawalRequestTitle(
        {
          linkedCaseIds: [],
          withdrawalCases: [{ three_letter_code: "ABC" }, { caseLabel: "DFGXXX" }],
        },
        "es"
      )
    ).toBe("Solicitud de retiro de ABC y DFG");
  });

  it("formats three linked cases in Spanish", () => {
    expect(
      getWithdrawalRequestTitle(
        {
          linkedCaseIds: [],
          withdrawalCases: [
            { three_letter_code: "ABC" },
            { three_letter_code: "DFG" },
            { three_letter_code: "HGI" },
          ],
        },
        "es"
      )
    ).toBe("Solicitud de retiro de ABC, DFG y HGI");
  });

  it("formats three linked cases in English", () => {
    expect(
      getWithdrawalRequestTitle(
        {
          linkedCaseIds: [],
          withdrawalCases: [
            { three_letter_code: "ABC" },
            { three_letter_code: "DFG" },
            { three_letter_code: "HGI" },
          ],
        },
        "en"
      )
    ).toBe("Withdrawal request for ABC, DFG, and HGI");
  });
});
