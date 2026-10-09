/** @jest-environment node */

import NewTwoPQFormPage from "@/app/(dashboard)/2pq-dashboard/forms/[formKind]/new/page";
import { getAdminContextServer } from "@/lib/admin-context-server";
import type { AdminContextRecord } from "@/lib/admin-areas";
import type { TwoPQListItem } from "@/lib/two-pq-areas";
import type { TwoPQFormRecord } from "@/lib/two-pq-forms";
import {
  getTwoPQCase,
  getTwoPQForm,
  getTwoPQFormDraft,
  getTwoPQFormLookupData,
} from "@/lib/two-pq-server";

jest.mock("next/navigation", () => ({
  notFound: jest.fn(() => {
    throw new Error("not found");
  }),
}));

jest.mock("@/lib/admin-context-server", () => ({
  getAdminContextServer: jest.fn(),
}));

jest.mock("@/lib/two-pq-server", () => ({
  getTwoPQCase: jest.fn(),
  getTwoPQForm: jest.fn(),
  getTwoPQFormDraft: jest.fn(),
  getTwoPQFormLookupData: jest.fn(),
}));

const adminContext: AdminContextRecord = {
  email: "admin@example.com",
  uid: "admin-uid",
  role: "full_admin",
  isBootstrap: false,
  canAccessBackoffice: true,
  canAccessPatientPortal: false,
  canAccessPGFlex: false,
  project: "mydnamap",
  projectAccess: ["mydnamap"],
};

const studyRequest: TwoPQFormRecord = {
  id: "FORM-00054",
  formType: "study_request",
  collectionKey: "2pq_forms",
  institutionId: "INST-00001",
  doctorId: "DOC-00001",
  selectedPatientId: "PAT-00001",
  linkedBiopsyForm: null,
  linkedWithdrawalRequest: null,
  "2pq_case": "CASE-00025",
  patientInformation: { patientId: "PAT-00001" },
  requestedTest: {},
  createdAt: "2026-10-09T12:00:00.000Z",
  updatedAt: "2026-10-09T12:00:00.000Z",
};

const caseRecord = {
  id: "CASE-00025",
  areaKey: "cases",
  collectionKey: "2pq_case",
  institutionId: "INST-00001",
  doctorId: "DOC-00001",
  patientId: "PAT-00001",
  caseLabel: "ABCXXX",
  caseStatus: "processing",
  createdAt: "2026-10-09T12:00:00.000Z",
  updatedAt: "2026-10-09T12:00:00.000Z",
  canReplace: true,
  canUpdate: true,
  canDelete: true,
} as TwoPQListItem;

function flowProps(page: Awaited<ReturnType<typeof NewTwoPQFormPage>>) {
  return (page.props as { children: { props: Record<string, unknown> } })
    .children.props;
}

describe("new 2PQ form query preselection", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(getAdminContextServer).mockResolvedValue(adminContext);
    jest.mocked(getTwoPQFormDraft).mockResolvedValue(null);
    jest.mocked(getTwoPQFormLookupData).mockResolvedValue({
      institutions: [],
      doctors: [],
      patients: [],
      cases: [],
      studyRequestForms: [],
    });
    jest.mocked(getTwoPQForm).mockResolvedValue(studyRequest);
    jest.mocked(getTwoPQCase).mockResolvedValue(caseRecord);
  });

  it("accepts studyRequestFormId and preselects the exact study in the biopsy wizard", async () => {
    const page = await NewTwoPQFormPage({
      params: Promise.resolve({ formKind: "sample" }),
      searchParams: Promise.resolve({
        studyRequestFormId: studyRequest.id,
      }),
    });
    const props = flowProps(page);

    expect(getTwoPQForm).toHaveBeenCalledWith(studyRequest.id);
    expect(props.initialLinkedStudyRequestFormId).toBe(studyRequest.id);
    expect(props.studyRequestForms).toEqual([studyRequest]);
    expect(props.initialWithdrawalCaseId).toBeUndefined();
  });

  it("accepts caseId and studyRequestFormId and preselects the exact case in the withdrawal wizard", async () => {
    const page = await NewTwoPQFormPage({
      params: Promise.resolve({ formKind: "withdrawal-request" }),
      searchParams: Promise.resolve({
        studyRequestFormId: studyRequest.id,
        caseId: caseRecord.id,
      }),
    });
    const props = flowProps(page);

    expect(getTwoPQForm).toHaveBeenCalledWith(studyRequest.id);
    expect(getTwoPQCase).toHaveBeenCalledWith(caseRecord.id);
    expect(props.initialWithdrawalCaseId).toBe(caseRecord.id);
    expect(props.cases).toEqual([caseRecord]);
    expect(props.initialLinkedStudyRequestFormId).toBeUndefined();
  });

  it("resolves the withdrawal case from the study request when caseId is omitted", async () => {
    const page = await NewTwoPQFormPage({
      params: Promise.resolve({ formKind: "withdrawal-request" }),
      searchParams: Promise.resolve({
        studyRequestFormId: studyRequest.id,
      }),
    });
    const props = flowProps(page);

    expect(getTwoPQForm).toHaveBeenCalledWith(studyRequest.id);
    expect(getTwoPQCase).toHaveBeenCalledWith(caseRecord.id);
    expect(props.initialWithdrawalCaseId).toBe(caseRecord.id);
    expect(props.cases).toEqual([caseRecord]);
  });
});
