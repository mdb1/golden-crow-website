const mockSdkFetchServer = jest.fn();

jest.mock("@/lib/sdk-server", () => ({
  sdkFetchServer: (...args: unknown[]) => mockSdkFetchServer(...args),
}));

describe("getTwoPQFormLookupData", () => {
  beforeEach(() => {
    mockSdkFetchServer.mockReset();
  });

  it("requests only available study requests and defensively removes linked forms", async () => {
    mockSdkFetchServer.mockImplementation(async (path: string) => {
      if (path === "/areas/institutions") {
        return { institutions: [] };
      }
      if (path === "/areas/doctors") {
        return { doctors: [] };
      }
      if (path === "/areas/patients") {
        return { patients: [] };
      }
      if (path === "/2pq/cases") {
        return { records: [] };
      }
      if (
        path ===
        "/2pq/forms?formType=study_request&availableForBiopsy=1&limit=20"
      ) {
        return {
          forms: [
            { id: "FORM-00047", formType: "study_request", linkedBiopsyForm: null, consent: { id: "CONS-47", status: "ready" } },
            { id: "FORM-00048", formType: "study_request", linkedBiopsyForm: "FORM-00055" },
            { id: "FORM-00049", formType: "study_request", requiresTreatmentStart: true },
          ],
        };
      }
      throw new Error(`Unexpected SDK path: ${path}`);
    });

    const { getTwoPQFormLookupData } = await import("@/lib/two-pq-server");
    const result = await getTwoPQFormLookupData({
      includeStudyRequestForms: true,
    });

    expect(result.studyRequestForms).toEqual([
      { id: "FORM-00047", formType: "study_request", linkedBiopsyForm: null, consent: { id: "CONS-47", status: "ready" } },
    ]);
    expect(mockSdkFetchServer).toHaveBeenCalledWith(
      "/2pq/forms?formType=study_request&availableForBiopsy=1&limit=20",
    );
  });
});
