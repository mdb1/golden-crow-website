import {
  DEFAULT_OBSERVATIONS_VALUE,
  getWithdrawalRequestTitle,
  normalizeObservationsValue,
} from "@/lib/two-pq-forms";

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
