/** @jest-environment node */

import TwoPQFormDetailPage from "@/app/(dashboard)/2pq-dashboard/forms/[formKind]/page";
import type { TwoPQListItem } from "@/lib/two-pq-areas";
import type { TwoPQFormRecord } from "@/lib/two-pq-forms";
import { getTwoPQCase, getTwoPQForm } from "@/lib/two-pq-server";

jest.mock("next/navigation", () => ({
  notFound: jest.fn(() => {
    throw new Error("not found");
  }),
}));

jest.mock("@/lib/two-pq-server", () => ({
  getTwoPQCase: jest.fn(),
  getTwoPQForm: jest.fn(),
}));

const form = {
  id: "FORM-00047",
  formType: "study_request",
  collectionKey: "2pq_forms",
  institutionId: "institution-1",
  doctorId: "doctor-1",
  "2pq_case": "CASE-00024",
  patientInformation: {},
  requestedTest: {},
  createdAt: "2026-10-09T12:00:00.000Z",
  updatedAt: "2026-10-09T12:00:00.000Z",
} as TwoPQFormRecord;

const linkedCase = {
  id: "CASE-00024",
  areaKey: "cases",
  collectionKey: "2pq_case",
  institutionId: "institution-1",
  doctorId: "doctor-1",
  caseLabel: "KIMXXX",
  createdAt: "2026-10-09T12:00:00.000Z",
  updatedAt: "2026-10-09T12:00:00.000Z",
  canReplace: true,
  canUpdate: true,
  canDelete: true,
} as TwoPQListItem;

describe("2PQ form detail page", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(getTwoPQForm).mockResolvedValue(form);
    jest.mocked(getTwoPQCase).mockResolvedValue(linkedCase);
  });

  it("loads the exact linked case so its case label is available to the detail component", async () => {
    const page = await TwoPQFormDetailPage({
      params: Promise.resolve({ formKind: form.id }),
    });

    expect(getTwoPQForm).toHaveBeenCalledWith(form.id);
    expect(getTwoPQCase).toHaveBeenCalledWith(linkedCase.id);
    expect(page.props).toMatchObject({ form, linkedCase });
  });
});
