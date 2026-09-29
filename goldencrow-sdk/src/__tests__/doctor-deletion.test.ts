export {};

import type { AdminContext } from "../types/sdk.types.js";

type MockData = Record<string, unknown>;

const collections = new Map<string, Map<string, MockData>>();
const queriedCollections: string[] = [];
const mockDeleteTwoPQCaseStepForContext = jest.fn();

function store(name: string) {
  let collection = collections.get(name);
  if (!collection) {
    collection = new Map<string, MockData>();
    collections.set(name, collection);
  }
  return collection;
}

function documentReference(collectionName: string, id: string) {
  const reference = {
    id,
    path: `${collectionName}/${id}`,
    get: async () => documentSnapshot(collectionName, id),
    delete: async () => {
      store(collectionName).delete(id);
    },
  };
  return reference;
}

function documentSnapshot(collectionName: string, id: string) {
  const data = store(collectionName).get(id);
  return {
    id,
    exists: Boolean(data),
    data: () => data,
    ref: documentReference(collectionName, id),
  };
}

function queryReference(
  collectionName: string,
  field: string,
  value: unknown,
  limit = Number.POSITIVE_INFINITY,
) {
  return {
    limit: (nextLimit: number) =>
      queryReference(collectionName, field, value, nextLimit),
    get: async () => {
      queriedCollections.push(collectionName);
      const docs = [...store(collectionName).entries()]
        .filter(([, data]) => data[field] === value)
        .slice(0, limit)
        .map(([id]) => documentSnapshot(collectionName, id));
      return { docs, empty: docs.length === 0 };
    },
  };
}

function collectionReference(name: string) {
  return {
    doc: (id: string) => documentReference(name, id),
    where: (field: string, _operator: string, value: unknown) =>
      queryReference(name, field, value),
  };
}

jest.mock("../config/firebase.js", () => ({
  adminDbFor: jest.fn(() => ({
    collection: (name: string) => collectionReference(name),
    batch: () => {
      const references: Array<ReturnType<typeof documentReference>> = [];
      return {
        delete: (reference: ReturnType<typeof documentReference>) => {
          references.push(reference);
        },
        commit: async () => {
          for (const reference of references) await reference.delete();
        },
      };
    },
  })),
}));

jest.mock("../repositories/roles.repository.js", () => ({
  canDeleteDoctor: jest.fn(
    (
      context: AdminContext,
      doctor: { institutionId: string },
    ) =>
      context.role === "full_admin" ||
      context.role === "2pq_admin" ||
      (context.role === "institution_admin" &&
        context.institutionId === doctor.institutionId),
  ),
  normalizeRoleEmail: (value: string) => value.trim().toLowerCase(),
}));

jest.mock("../repositories/two-pq-case-deletion.repository.js", () => ({
  TWO_PQ_CASE_DELETION_STEPS: [
    "form_links",
    "samplings",
    "service_transaction",
    "files_and_codes",
    "case",
  ],
  deleteTwoPQCaseStepForContext: mockDeleteTwoPQCaseStepForContext,
}));

const fullAdmin: AdminContext = {
  email: "admin@example.com",
  uid: "admin-uid",
  role: "full_admin",
  isBootstrap: false,
  canAccessBackoffice: true,
  canAccessPatientPortal: false,
  canAccessPGFlex: false,
  projectAccess: ["mydnamap"],
};

describe("staged doctor deletion", () => {
  beforeEach(() => {
    collections.clear();
    queriedCollections.length = 0;
    jest.clearAllMocks();
    store("doctors").set("DOC-00001", {
      institutionId: "INST-00001",
      authEmail: "Doctor@Example.com",
      authUid: "doctor-uid",
      fullName: "Dr. Ada Lovelace",
    });
    mockDeleteTwoPQCaseStepForContext.mockImplementation(
      async (
        _context: AdminContext,
        caseId: string,
        _scope: string,
        step: string,
      ) => {
        if (step === "case") store("2pq_case").delete(caseId);
        return {
          step,
          status: "deleted",
          deletedCount: 1,
          message: `Deleted ${step}.`,
        };
      },
    );
  });

  it("deletes only the doctor entity in doctor-only scope", async () => {
    store("patients").set("PAT-00001", { doctorId: "DOC-00001" });
    store("2pq_case").set("CASE-00001", { doctorId: "DOC-00001" });
    store("user_roles").set("doctor@example.com", {
      role: "institution_doctor",
      doctorId: "DOC-00001",
    });

    const { deleteDoctorStepForContext } = await import(
      "../repositories/doctor-deletion.repository.js"
    );
    const result = await deleteDoctorStepForContext(
      {
        ...fullAdmin,
        role: "institution_admin",
        institutionId: "INST-00001",
      },
      "DOC-00001",
      "doctor",
      "doctor",
    );

    expect(result).toMatchObject({
      step: "doctor",
      status: "deleted",
      deletedCount: 1,
    });
    expect(store("doctors").has("DOC-00001")).toBe(false);
    expect(store("patients").has("PAT-00001")).toBe(true);
    expect(store("2pq_case").has("CASE-00001")).toBe(true);
    expect(store("user_roles").has("doctor@example.com")).toBe(true);
  });

  it("limits full cleanup to full admins and 2PQ admins", async () => {
    const { deleteDoctorStepForContext } = await import(
      "../repositories/doctor-deletion.repository.js"
    );

    await expect(
      deleteDoctorStepForContext(
        {
          ...fullAdmin,
          role: "institution_admin",
          institutionId: "INST-00001",
        },
        "DOC-00001",
        "full",
        "patients",
      ),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(store("doctors").has("DOC-00001")).toBe(true);
  });

  it("deletes linked cases one at a time through the case cleanup contract", async () => {
    store("2pq_case").set("CASE-00001", { doctorId: "DOC-00001" });
    store("2pq_case").set("CASE-00002", { doctorId: "DOC-00001" });
    const { deleteDoctorStepForContext } = await import(
      "../repositories/doctor-deletion.repository.js"
    );

    const first = await deleteDoctorStepForContext(
      fullAdmin,
      "DOC-00001",
      "full",
      "cases",
    );
    const second = await deleteDoctorStepForContext(
      fullAdmin,
      "DOC-00001",
      "full",
      "cases",
    );

    expect(first).toMatchObject({ deletedCount: 1, hasMore: true });
    expect(second).toMatchObject({ deletedCount: 1, hasMore: false });
    expect(mockDeleteTwoPQCaseStepForContext).toHaveBeenCalledTimes(10);
    expect(store("2pq_case").size).toBe(0);
  });

  it("deletes each patient and only that patient's role assignments", async () => {
    store("patients").set("PAT-00001", { doctorId: "DOC-00001" });
    store("user_roles").set("patient@example.com", {
      role: "patient",
      patientId: "PAT-00001",
    });
    store("user_roles").set("doctor@example.com", {
      role: "institution_doctor",
      doctorId: "DOC-00001",
    });
    const { deleteDoctorStepForContext } = await import(
      "../repositories/doctor-deletion.repository.js"
    );

    const result = await deleteDoctorStepForContext(
      fullAdmin,
      "DOC-00001",
      "full",
      "patients",
    );

    expect(result).toMatchObject({ status: "deleted", deletedCount: 1 });
    expect(store("patients").has("PAT-00001")).toBe(false);
    expect(store("user_roles").has("patient@example.com")).toBe(false);
    expect(store("user_roles").has("doctor@example.com")).toBe(true);
  });

  it("deletes owner accounts without querying or deleting their artifacts", async () => {
    store("user_roles").set("doctor@example.com", {
      role: "institution_doctor",
      doctorId: "DOC-00001",
      firebaseUid: "doctor-uid",
      email: "doctor@example.com",
    });
    store("report_owners").set("doctor-uid", {
      owner_contact_email: "doctor@example.com",
    });
    store("report_codes").set("ABCXXX", { owner_id: "doctor-uid" });
    store("uploaded_reports").set("UP-1", {
      report_owner_id: "doctor-uid",
    });
    const { deleteDoctorStepForContext } = await import(
      "../repositories/doctor-deletion.repository.js"
    );

    const result = await deleteDoctorStepForContext(
      fullAdmin,
      "DOC-00001",
      "full",
      "report_owner",
    );

    expect(result).toMatchObject({ status: "deleted", deletedCount: 1 });
    expect(store("report_owners").has("doctor-uid")).toBe(false);
    expect(store("report_codes").has("ABCXXX")).toBe(true);
    expect(store("uploaded_reports").has("UP-1")).toBe(true);
    expect(queriedCollections).not.toContain("report_codes");
    expect(queriedCollections).not.toContain("uploaded_reports");
  });

  it("refuses the final full-cleanup step while dependencies remain", async () => {
    store("patients").set("PAT-00001", { doctorId: "DOC-00001" });
    const { deleteDoctorStepForContext } = await import(
      "../repositories/doctor-deletion.repository.js"
    );

    await expect(
      deleteDoctorStepForContext(
        fullAdmin,
        "DOC-00001",
        "full",
        "doctor",
      ),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(store("doctors").has("DOC-00001")).toBe(true);
  });
});
