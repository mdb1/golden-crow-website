/** @jest-environment node */

import PatientPortalConsentsPage from "@/app/patient-portal/(portal)/consents/page";
import { sdkFetchServer } from "@/lib/sdk-server";

jest.mock("@/lib/sdk-server", () => ({
  sdkFetchServer: jest.fn(),
}));

const initialPage = {
  records: [],
  nextCursor: undefined,
};

const draftSummary = {
  mode: "guided" as const,
  activeStepId: "data" as const,
  updatedAt: "2026-10-16T12:00:00.000Z",
  revision: 4,
};

describe("patient portal consent list page", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("loads consent records and the lightweight draft status in parallel", async () => {
    jest.mocked(sdkFetchServer).mockImplementation(async (path) => {
      if (path === "/2pq/informed-consents") return initialPage;
      if (path === "/2pq/informed-consents/draft/status") {
        return { draft: draftSummary };
      }
      throw new Error(`Unexpected SDK path: ${path}`);
    });

    const page = await PatientPortalConsentsPage();

    expect(sdkFetchServer).toHaveBeenCalledWith("/2pq/informed-consents");
    expect(sdkFetchServer).toHaveBeenCalledWith(
      "/2pq/informed-consents/draft/status",
    );
    expect(page.props).toMatchObject({
      surface: "patient-portal",
      initialPage,
      initialDraftSummary: draftSummary,
      draftLookupFailed: false,
    });
  });

  it("does not take down the consent list when optional draft detection fails", async () => {
    jest.mocked(sdkFetchServer).mockImplementation(async (path) => {
      if (path === "/2pq/informed-consents") return initialPage;
      if (path === "/2pq/informed-consents/draft/status") {
        throw new Error("draft status unavailable");
      }
      throw new Error(`Unexpected SDK path: ${path}`);
    });

    const page = await PatientPortalConsentsPage();

    expect(page.props).toMatchObject({
      initialPage,
      initialDraftSummary: null,
      draftLookupFailed: true,
    });
  });
});
