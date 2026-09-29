export {};

import type { AdminContext } from "../types/sdk.types.js";
import { AdminRepositoryError } from "../repositories/admin-errors.js";

type MockData = Record<string, unknown>;

const documents = new Map<string, MockData>();
const mockUpsertUserRoleForContext = jest.fn();

function documentReference(collectionName: string, id: string) {
  const key = `${collectionName}/${id}`;
  return {
    id,
    path: key,
    get: jest.fn(async () => {
      const data = documents.get(key);
      return {
        id,
        exists: Boolean(data),
        data: () => data,
      };
    }),
    set: jest.fn(async (data: MockData, options?: { merge?: boolean }) => {
      documents.set(key, {
        ...(options?.merge ? documents.get(key) : {}),
        ...data,
      });
    }),
    delete: jest.fn(async () => {
      documents.delete(key);
    }),
  };
}

const mockDb = {
  collection: (name: string) => ({
    doc: (id: string) => documentReference(name, id),
  }),
  runTransaction: async <T>(
    operation: (transaction: {
      get: (reference: ReturnType<typeof documentReference>) => Promise<{
        data: () => MockData | undefined;
      }>;
      set: (
        reference: ReturnType<typeof documentReference>,
        data: MockData,
        options?: { merge?: boolean },
      ) => void;
    }) => Promise<T>,
  ) => {
    const writes: Array<{
      reference: ReturnType<typeof documentReference>;
      data: MockData;
      options?: { merge?: boolean };
    }> = [];
    const result = await operation({
      get: async (reference) => reference.get(),
      set: (reference, data, options) => {
        writes.push({ reference, data, options });
      },
    });
    for (const write of writes) {
      await write.reference.set(write.data, write.options);
    }
    return result;
  },
};

jest.mock("../config/firebase.js", () => ({
  adminAuthFor: jest.fn(() => ({})),
  adminDbFor: jest.fn(() => mockDb),
}));

jest.mock("../repositories/roles.repository.js", () => ({
  canCreateDoctor: jest.fn(() => true),
  canCreateInstitution: jest.fn(),
  canCreatePatient: jest.fn(),
  canDeleteDoctor: jest.fn(),
  canDeleteInstitution: jest.fn(),
  canDeletePatient: jest.fn(),
  canEditDoctor: jest.fn(),
  canEditInstitution: jest.fn(),
  canEditPatient: jest.fn(),
  canViewDoctor: jest.fn(),
  canViewInstitution: jest.fn(),
  canViewPatient: jest.fn(),
  getBackofficeEmailAccess: jest.fn(),
  getUserRoleByEmail: jest.fn(),
  normalizeRoleEmail: (value: string) => value.trim().toLowerCase(),
  upsertUserRoleForContext: mockUpsertUserRoleForContext,
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

describe("doctor creation role provisioning", () => {
  beforeEach(() => {
    documents.clear();
    jest.clearAllMocks();
    documents.set("institutions/INST-00001", {
      id: "INST-00001",
      code: "CENTRAL",
      name: "Central Clinic",
      createdAt: "2026-09-29T12:00:00.000Z",
      updatedAt: "2026-09-29T12:00:00.000Z",
    });
    mockUpsertUserRoleForContext.mockResolvedValue({
      email: "doctor@example.com",
      role: "institution_doctor",
    });
  });

  it("creates the linked institution doctor role after the doctor", async () => {
    const { createDoctorForContext } = await import(
      "../repositories/areas.repository.js"
    );

    const doctor = await createDoctorForContext(fullAdmin, {
      institutionId: "INST-00001",
      authEmail: " Doctor@Example.com ",
      fullName: "Dr. Ada Lovelace",
      status: "active",
    });

    expect(doctor).toMatchObject({
      id: "DOC-00001",
      authEmail: "doctor@example.com",
      institutionId: "INST-00001",
    });
    expect(documents.get("doctors/DOC-00001")).toMatchObject({
      id: "DOC-00001",
      authEmail: "doctor@example.com",
      fullName: "Dr. Ada Lovelace",
    });
    expect(mockUpsertUserRoleForContext).toHaveBeenCalledWith(
      fullAdmin,
      "doctor@example.com",
      {
        role: "institution_doctor",
        institutionId: "INST-00001",
        doctorId: "DOC-00001",
        isActive: true,
        displayName: "Dr. Ada Lovelace",
      },
    );
  });

  it("rolls back the new doctor when its role cannot be created", async () => {
    mockUpsertUserRoleForContext.mockRejectedValue(
      new AdminRepositoryError("Another role already uses this email.", 409),
    );
    const { createDoctorForContext } = await import(
      "../repositories/areas.repository.js"
    );

    await expect(
      createDoctorForContext(fullAdmin, {
        institutionId: "INST-00001",
        authEmail: "doctor@example.com",
        fullName: "Dr. Ada Lovelace",
      }),
    ).rejects.toMatchObject({
      message: "Another role already uses this email.",
      statusCode: 409,
    });
    expect(documents.has("doctors/DOC-00001")).toBe(false);
  });
});
