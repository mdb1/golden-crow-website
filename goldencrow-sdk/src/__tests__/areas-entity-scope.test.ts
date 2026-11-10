import { FieldValue } from "firebase-admin/firestore";
import { makeAdminContext } from "./support/route-harness.js";

const mockDocuments = new Map<string, Record<string, unknown>>();
const mockDb = {
  collection: (collection: string) => ({
    doc: (id: string) => {
      const key = `${collection}/${id}`;
      return {
        get: async () => ({
          id,
          exists: mockDocuments.has(key),
          data: () => mockDocuments.get(key),
        }),
        set: async (data: Record<string, unknown>, options?: { merge: boolean }) => {
          if (Object.values(data).some((value) => value === undefined)) {
            throw new Error("Firestore does not accept undefined values");
          }
          mockDocuments.set(key, {
            ...(options?.merge ? mockDocuments.get(key) : {}),
            ...data,
          });
        },
      };
    },
    where: () => ({ get: async () => ({ empty: true, docs: [] }) }),
  }),
};

jest.mock("../config/firebase.js", () => ({
  adminAuthFor: jest.fn(() => ({})),
  adminDbFor: jest.fn(() => mockDb),
}));

describe("2PQ institution entity writes", () => {
  let repository: typeof import("../repositories/areas.repository.js");

  beforeAll(async () => {
    repository = await import("../repositories/areas.repository.js");
  });

  const patient = {
    institutionId: "INST-1",
    doctorId: "DOC-1",
    email: "patient@example.com",
    fullName: "Original Patient",
  };

  beforeEach(() => {
    mockDocuments.clear();
    mockDocuments.set("institutions/INST-1", { name: "Clinic" });
    mockDocuments.set("doctors/DOC-1", {
      institutionId: "INST-1",
      authEmail: "doctor@example.com",
      fullName: "Original Doctor",
    });
    mockDocuments.set("patients/PAT-1", { ...patient, notes: "old note" });
  });

  it.each(["institution_admin", "institution_operator"] as const)(
    "saves patient and doctor names for %s even when optional fields are missing",
    async (role) => {
      const context = makeAdminContext({ role, institutionId: "INST-1" });

      await expect(repository.updatePatientForContext(context, "PAT-1", { fullName: "Li Wu", notes: "" }))
        .resolves.toMatchObject({ fullName: "Li Wu" });
      expect(mockDocuments.get("patients/PAT-1")).toMatchObject({
        fullName: "Li Wu",
        notes: FieldValue.delete(),
      });
      await expect(repository.updateDoctorForContext(context, "DOC-1", { fullName: "Doctor Wu" }))
        .resolves.toMatchObject({ fullName: "Doctor Wu" });
    },
  );

  it("lets laboratory staff register a patient through the form only, inside their institution", async () => {
    const context = makeAdminContext({ role: "institution_laboratory_staff", institutionId: "INST-1" });

    await expect(repository.createPatientForContext(context, patient)).rejects.toMatchObject({ statusCode: 403 });
    await expect(repository.createPatientForTwoPQForm(context, { ...patient, institutionId: "INST-2" }))
      .rejects.toMatchObject({ statusCode: 403 });
    mockDocuments.set("doctors/DOC-2", { institutionId: "INST-2" });
    await expect(repository.createPatientForTwoPQForm(context, { ...patient, doctorId: "DOC-2" }))
      .rejects.toMatchObject({ statusCode: 400 });
    await expect(repository.createPatientForTwoPQForm(context, patient)).resolves.toMatchObject(patient);
  });

  it("rejects cross-institution patient changes and portal provisioning", async () => {
    const operator = makeAdminContext({ role: "institution_operator", institutionId: "INST-2" });
    const lab = makeAdminContext({ role: "institution_laboratory_staff", institutionId: "INST-2" });
    await expect(repository.updatePatientForContext(operator, "PAT-1", { fullName: "Wrong" }))
      .rejects.toMatchObject({ statusCode: 403 });
    await expect(repository.grantPatientPortalAccessForTwoPQForm(lab, "PAT-1"))
      .rejects.toMatchObject({ statusCode: 403 });
    expect(mockDocuments.get("patients/PAT-1")?.fullName).toBe("Original Patient");
  });
});
