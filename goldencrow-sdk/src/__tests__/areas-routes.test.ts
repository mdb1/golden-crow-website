// Route-level tests for the risky writes of /areas/*: patient-portal access,
// the temporary password read-back, patient / doctor / institution deletions
// and the staged doctor cleanup. The route requires an admin context and
// validates input; the per-role scoping is the repository's job, so here we
// check its refusals reach the client and secrets are never cached.
import type { FastifyInstance } from "fastify";
import { AdminRepositoryError } from "../repositories/admin-errors.js";
import type { AdminContext } from "../types/sdk.types.js";
import { buildRouteServer, makeAdminContext } from "./support/route-harness.js";

const mockCreateInstitutionForContext = jest.fn();
const mockDeleteDoctorForContext = jest.fn();
const mockDeleteInstitutionForContext = jest.fn();
const mockDeletePatientForContext = jest.fn();
const mockGetPatientPortalTemporaryPasswordForContext = jest.fn();
const mockGrantPatientPortalAccessForContext = jest.fn();
const mockCreatePatientForContext = jest.fn();
const mockUpdatePatientForContext = jest.fn();
const mockDeleteDoctorStepForContext = jest.fn();

jest.mock("../repositories/areas.repository.js", () => ({
  createDoctorForContext: jest.fn(),
  createInstitutionForContext: mockCreateInstitutionForContext,
  createPatientForContext: mockCreatePatientForContext,
  deleteDoctorForContext: mockDeleteDoctorForContext,
  deleteInstitutionForContext: mockDeleteInstitutionForContext,
  deletePatientForContext: mockDeletePatientForContext,
  getDoctorDetailForContext: jest.fn(),
  getInstitutionDetailForContext: jest.fn(),
  getPatientDetailForContext: jest.fn(),
  getPatientPortalTemporaryPasswordForContext:
    mockGetPatientPortalTemporaryPasswordForContext,
  grantPatientPortalAccessForContext: mockGrantPatientPortalAccessForContext,
  listDoctorsForContext: jest.fn(),
  listInstitutionsForContext: jest.fn(),
  listPatientsForContext: jest.fn(),
  updateDoctorForContext: jest.fn(),
  updateInstitutionForContext: jest.fn(),
  updatePatientForContext: mockUpdatePatientForContext,
}));

jest.mock("../repositories/doctor-deletion.repository.js", () => ({
  DOCTOR_DELETION_STEPS: [
    "cases",
    "patients",
    "report_owner",
    "object_owner",
    "role",
    "doctor",
  ],
  deleteDoctorStepForContext: mockDeleteDoctorStepForContext,
}));

const riskyWriteMocks = [
  mockCreateInstitutionForContext,
  mockDeleteDoctorForContext,
  mockDeleteInstitutionForContext,
  mockDeletePatientForContext,
  mockGetPatientPortalTemporaryPasswordForContext,
  mockGrantPatientPortalAccessForContext,
  mockCreatePatientForContext,
  mockUpdatePatientForContext,
  mockDeleteDoctorStepForContext,
];

const riskyEndpoints = [
  { method: "POST" as const, url: "/areas/patients/PAT-1/patient-portal-access" },
  {
    method: "GET" as const,
    url: "/areas/patients/PAT-1/patient-portal-access/temporary-password",
  },
  { method: "DELETE" as const, url: "/areas/patients/PAT-1" },
  { method: "DELETE" as const, url: "/areas/doctors/DOC-1" },
  { method: "DELETE" as const, url: "/areas/doctors/DOC-1/deletion/cases?scope=full" },
  { method: "DELETE" as const, url: "/areas/institutions/INS-1" },
  {
    method: "PUT" as const,
    url: "/areas/patients/PAT-1",
    payload: { doctorId: "DOC-OTHER" },
  },
];

const TEMP_PASSWORD = "Tmp-Secret-Passw0rd!";

let currentContext: AdminContext | undefined;
let fastify: FastifyInstance;

beforeEach(async () => {
  jest.clearAllMocks();
  currentContext = makeAdminContext({
    role: "institution_admin",
    institutionId: "INS-1",
  });
  const { areasRoutes } = await import("../routes/areas.routes.js");
  fastify = await buildRouteServer(areasRoutes, () => currentContext);
});

afterEach(async () => {
  await fastify.close();
});

describe("areas routes — authentication", () => {
  it.each(riskyEndpoints)(
    "$method $url returns 401 without an admin context and calls no repository",
    async ({ method, url, payload }) => {
      currentContext = undefined;

      const response = await fastify.inject({ method, url, payload });

      expect(response.statusCode).toBe(401);
      for (const mock of riskyWriteMocks) {
        expect(mock).not.toHaveBeenCalled();
      }
    },
  );
});

describe("patient portal access", () => {
  it("grants access for the addressed patient and forbids caching the result", async () => {
    mockGrantPatientPortalAccessForContext.mockResolvedValue({
      temporaryPassword: TEMP_PASSWORD,
    });

    const response = await fastify.inject({
      method: "POST",
      url: "/areas/patients/PAT-1/patient-portal-access",
    });

    expect(response.statusCode).toBe(200);
    expect(mockGrantPatientPortalAccessForContext).toHaveBeenCalledWith(
      currentContext,
      "PAT-1",
    );
    expect(response.headers["cache-control"]).toBe("private, no-store");
  });

  it("returns the temporary password with no-store", async () => {
    mockGetPatientPortalTemporaryPasswordForContext.mockResolvedValue(
      TEMP_PASSWORD,
    );

    const response = await fastify.inject({
      method: "GET",
      url: "/areas/patients/PAT-1/patient-portal-access/temporary-password",
    });

    expect(response.statusCode).toBe(200);
    expect(mockGetPatientPortalTemporaryPasswordForContext).toHaveBeenCalledWith(
      currentContext,
      "PAT-1",
    );
    expect(response.headers["cache-control"]).toBe("private, no-store");
    expect(response.json()).toEqual({ temporaryPassword: TEMP_PASSWORD });
  });

  it.each([
    ["an out-of-scope patient", "Patient is outside your institution.", 403],
    ["a patient without portal access", "Temporary password not found.", 404],
  ])(
    "maps the repository refusal for %s and returns no password",
    async (_, message, statusCode) => {
      mockGetPatientPortalTemporaryPasswordForContext.mockRejectedValue(
        new AdminRepositoryError(message, statusCode),
      );

      const response = await fastify.inject({
        method: "GET",
        url: "/areas/patients/PAT-OTHER/patient-portal-access/temporary-password",
      });

      expect(response.statusCode).toBe(statusCode);
      expect(response.json()).toEqual({ error: message });
      expect(response.body).not.toContain("temporaryPassword");
    },
  );

  it("maps a refused grant (e.g. doctor role) to 403", async () => {
    currentContext = makeAdminContext({
      role: "institution_doctor",
      doctorId: "DOC-1",
    });
    mockGrantPatientPortalAccessForContext.mockRejectedValue(
      new AdminRepositoryError("Not allowed to grant portal access.", 403),
    );

    const response = await fastify.inject({
      method: "POST",
      url: "/areas/patients/PAT-1/patient-portal-access",
    });

    expect(response.statusCode).toBe(403);
  });
});

describe("deletions", () => {
  it("deletes a patient as the calling context", async () => {
    mockDeletePatientForContext.mockResolvedValue({ deleted: true });

    const response = await fastify.inject({
      method: "DELETE",
      url: "/areas/patients/PAT-1",
    });

    expect(response.statusCode).toBe(200);
    expect(mockDeletePatientForContext).toHaveBeenCalledWith(
      currentContext,
      "PAT-1",
    );
  });

  it.each([
    ["DELETE /areas/patients/:id", "/areas/patients/PAT-OTHER", mockDeletePatientForContext],
    ["DELETE /areas/doctors/:id", "/areas/doctors/DOC-OTHER", mockDeleteDoctorForContext],
    ["DELETE /areas/institutions/:id", "/areas/institutions/INS-OTHER", mockDeleteInstitutionForContext],
  ] as const)("%s maps a cross-tenant 403 from the repository", async (_, url, mock) => {
    mock.mockRejectedValue(
      new AdminRepositoryError("Outside your institution.", 403),
    );

    const response = await fastify.inject({ method: "DELETE", url });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({ error: "Outside your institution." });
  });

  it("rethrows non-repository failures as a generic 500", async () => {
    mockDeletePatientForContext.mockRejectedValue(new Error("boom"));

    const response = await fastify.inject({
      method: "DELETE",
      url: "/areas/patients/PAT-1",
    });

    expect(response.statusCode).toBe(500);
  });
});

describe("staged doctor cleanup", () => {
  it.each([
    ["an unknown step", "/areas/doctors/DOC-1/deletion/everything?scope=full"],
    ["a missing scope", "/areas/doctors/DOC-1/deletion/cases"],
    ["an unknown scope", "/areas/doctors/DOC-1/deletion/cases?scope=all"],
  ])("rejects %s with 400", async (_, url) => {
    const response = await fastify.inject({ method: "DELETE", url });

    expect(response.statusCode).toBe(400);
    expect(mockDeleteDoctorStepForContext).not.toHaveBeenCalled();
  });

  it("runs the requested step with the requested scope", async () => {
    mockDeleteDoctorStepForContext.mockResolvedValue({ step: "role", done: true });

    const response = await fastify.inject({
      method: "DELETE",
      url: "/areas/doctors/DOC-1/deletion/role?scope=doctor",
    });

    expect(response.statusCode).toBe(200);
    expect(mockDeleteDoctorStepForContext).toHaveBeenCalledWith(
      currentContext,
      "DOC-1",
      "doctor",
      "role",
    );
  });

  it("reports a permission refusal with its status and without a stack", async () => {
    mockDeleteDoctorStepForContext.mockRejectedValue(
      new AdminRepositoryError("Only full admins can run a full cleanup.", 403),
    );

    const response = await fastify.inject({
      method: "DELETE",
      url: "/areas/doctors/DOC-1/deletion/cases?scope=full",
    });

    expect(response.statusCode).toBe(403);
    const body = response.json();
    expect(body).toMatchObject({
      error: "Only full admins can run a full cleanup.",
      statusCode: 403,
    });
    expect(body.stack).toBeUndefined();
  });
});

describe("input validation on writes", () => {
  it.each([
    ["a non-Argentina country", { country: "Uruguay" }],
    ["an unknown province", { state: "Cordoba" }],
    ["a too-short address", { address: "ab" }],
    ["a missing name", { name: undefined }],
  ])("rejects an institution with %s (400)", async (_, override) => {
    const response = await fastify.inject({
      method: "POST",
      url: "/areas/institutions",
      payload: {
        name: "Clinic",
        address: "Av. Siempreviva 742",
        city: "CABA",
        state: "Capital Federal",
        country: "Argentina",
        ...override,
      },
    });

    expect(response.statusCode).toBe(400);
    expect(mockCreateInstitutionForContext).not.toHaveBeenCalled();
  });

  it.each([
    ["a missing doctorId", { institutionId: "INS-1", email: "p@x.com", fullName: "P" }],
    ["an unknown status", { institutionId: "INS-1", doctorId: "DOC-1", email: "p@x.com", fullName: "P", status: "deleted" }],
  ])("rejects a patient with %s (400)", async (_, payload) => {
    const response = await fastify.inject({
      method: "POST",
      url: "/areas/patients",
      payload,
    });

    expect(response.statusCode).toBe(400);
    expect(mockCreatePatientForContext).not.toHaveBeenCalled();
  });

  it("passes a patient reassignment to the repository for its scope check", async () => {
    mockUpdatePatientForContext.mockRejectedValue(
      new AdminRepositoryError("Doctor is outside your institution.", 403),
    );

    const response = await fastify.inject({
      method: "PUT",
      url: "/areas/patients/PAT-1",
      payload: { doctorId: "DOC-OTHER", institutionId: "INS-OTHER" },
    });

    expect(response.statusCode).toBe(403);
    expect(mockUpdatePatientForContext).toHaveBeenCalledWith(
      currentContext,
      "PAT-1",
      { doctorId: "DOC-OTHER", institutionId: "INS-OTHER" },
    );
  });
});
