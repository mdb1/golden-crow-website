import Fastify from "fastify";
import {
  serializerCompiler,
  validatorCompiler,
} from "fastify-type-provider-zod";
import type { AdminContext } from "../types/sdk.types.js";

const mockCreateStoredFileDocument = jest.fn();
const mockDeleteStoredFileDocument = jest.fn();
const mockGetStoredFileDocument = jest.fn();
const mockListStoredFileDocuments = jest.fn();
const mockUpdateStoredFileDocument = jest.fn();
const mockValidateStoredFileJsonContent = jest.fn();
const mockFileStorageRequestBodyLimitBytes = 6 * 1024 * 1024;

class MockStoredFileValidationError extends Error {}
class MockStoredFileDeleteBlockedError extends Error {}
class MockStoredFileUpdateBlockedError extends Error {}

jest.mock("../repositories/file-storage.repository.js", () => ({
  createStoredFileDocument: mockCreateStoredFileDocument,
  deleteStoredFileDocument: mockDeleteStoredFileDocument,
  getStoredFileDocument: mockGetStoredFileDocument,
  listStoredFileDocuments: mockListStoredFileDocuments,
  updateStoredFileDocument: mockUpdateStoredFileDocument,
  validateStoredFileJsonContent: mockValidateStoredFileJsonContent,
  FILE_STORAGE_REQUEST_BODY_LIMIT_BYTES:
    mockFileStorageRequestBodyLimitBytes,
  StoredFileValidationError: MockStoredFileValidationError,
  StoredFileDeleteBlockedError: MockStoredFileDeleteBlockedError,
  StoredFileUpdateBlockedError: MockStoredFileUpdateBlockedError,
}));

jest.mock("../repositories/roles.repository.js", () => ({
  canManageLegacyModeration: jest.fn(() => true),
}));

const adminContext: AdminContext = {
  email: "god@example.com",
  uid: "god-1",
  role: "full_admin",
  isBootstrap: true,
  canAccessBackoffice: true,
  canAccessPatientPortal: false,
  canAccessPGFlex: false,
  projectAccess: ["mydnamap"],
};

async function buildTestServer(context: AdminContext | null = adminContext) {
  const { fileStorageRoutes } = await import(
    "../routes/file-storage.routes.js"
  );
  const fastify = Fastify();
  fastify.setValidatorCompiler(validatorCompiler);
  fastify.setSerializerCompiler(serializerCompiler);
  fastify.addHook("onRequest", async (request) => {
    request.adminContext = context ?? undefined;
  });
  await fastify.register(fileStorageRoutes);
  return fastify;
}

describe("file storage admin routes", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockListStoredFileDocuments.mockResolvedValue({
      documents: [],
      nextCursor: null,
    });
  });

  it("passes bounded document-ID pagination to the repository", async () => {
    const fastify = await buildTestServer();
    const response = await fastify.inject({
      method: "GET",
      url: "/file-storage?limit=35&cursor=file-200",
    });

    expect(response.statusCode).toBe(200);
    expect(mockListStoredFileDocuments).toHaveBeenCalledWith({
      limit: 35,
      cursor: "file-200",
    });
    expect(response.json()).toEqual({ documents: [], nextCursor: null });
    await fastify.close();
  });

  it("validates and canonicalizes PGO and native PGI JSON without persisting", async () => {
    mockValidateStoredFileJsonContent
      .mockReturnValueOnce({
        fileType: "pgo_pdf_report",
        fileContent:
          '{"title":"Final report","download_url":"https://example.com/report.pdf"}',
      })
      .mockReturnValueOnce({
        fileType: "mdm",
        fileContent: '{"protocol_version":"1.0.0"}',
      });
    const fastify = await buildTestServer();

    const pgoResponse = await fastify.inject({
      method: "POST",
      url: "/file-storage/validate",
      payload: {
        fileType: "pgo_pdf_report",
        fileContent:
          '{ "title": "Final report", "download_url": "https://example.com/report.pdf" }',
      },
    });
    const pgiResponse = await fastify.inject({
      method: "POST",
      url: "/file-storage/validate",
      payload: {
        fileType: "mdm",
        fileContent: '{ "protocol_version": "1.0.0" }',
      },
    });

    expect(pgoResponse.statusCode).toBe(200);
    expect(pgoResponse.json()).toMatchObject({
      valid: true,
      fileType: "pgo_pdf_report",
    });
    expect(pgiResponse.statusCode).toBe(200);
    expect(pgiResponse.json()).toMatchObject({ valid: true, fileType: "mdm" });
    expect(mockCreateStoredFileDocument).not.toHaveBeenCalled();
    await fastify.close();
  });

  it.each([
    "Stored file content matches mdm, not declared file_type ag.",
    "Stored file content does not match any supported native model (mdm, ag, or 2pq).",
    "Stored file content does not match the pgo_pdf_report schema.",
  ])("returns validation failures as descriptive 400 responses", async (message) => {
    mockValidateStoredFileJsonContent.mockImplementationOnce(() => {
      throw new MockStoredFileValidationError(message);
    });
    const fastify = await buildTestServer();
    const response = await fastify.inject({
      method: "POST",
      url: "/file-storage/validate",
      payload: { fileType: "ag", fileContent: "{}" },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: message });
    await fastify.close();
  });

  it("creates with snake-case data and defaults creator_email to the admin", async () => {
    mockCreateStoredFileDocument.mockResolvedValue({
      document: {
        id: "stored-file-1",
        path: "file_storage/stored-file-1",
        collection: "file_storage",
        data: {},
      },
    });
    const fastify = await buildTestServer();
    const response = await fastify.inject({
      method: "POST",
      url: "/file-storage",
      payload: {
        data: {
          file_type: "pgo_pdf_report",
          file_content:
            '{"title":"Final report","download_url":"https://example.com/report.pdf"}',
        },
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().document.id).toBe("stored-file-1");
    expect(mockCreateStoredFileDocument).toHaveBeenCalledWith({
      creator_email: "god@example.com",
      file_type: "pgo_pdf_report",
      file_content:
        '{"title":"Final report","download_url":"https://example.com/report.pdf"}',
    });
    await fastify.close();
  });

  it.each(["creation_date", "linked_object_code", "fileType"])(
    "rejects client-owned or wrong-case create key %s",
    async (extraKey) => {
      const fastify = await buildTestServer();
      const response = await fastify.inject({
        method: "POST",
        url: "/file-storage",
        payload: {
          data: {
            file_type: "pgo_pdf_report",
            file_content:
              '{"title":"Final report","download_url":"https://example.com/report.pdf"}',
            [extraKey]: extraKey === "fileType" ? "pgo_pdf_report" : null,
          },
        },
      });

      expect(response.statusCode).toBe(400);
      expect(mockCreateStoredFileDocument).not.toHaveBeenCalled();
      await fastify.close();
    },
  );

  it.each([
    {
      url: "/file-storage/validate",
      payload: (content: string) => ({
        fileType: "pgo_pdf_report",
        fileContent: content,
      }),
    },
    {
      url: "/file-storage",
      payload: (content: string) => ({
        data: {
          file_type: "pgo_pdf_report",
          file_content: content,
        },
      }),
    },
  ])("returns 413 before handling an oversized $url request", async ({ url, payload }) => {
    const fastify = await buildTestServer();
    const response = await fastify.inject({
      method: "POST",
      url,
      payload: payload("x".repeat(mockFileStorageRequestBodyLimitBytes + 1)),
    });

    expect(response.statusCode).toBe(413);
    expect(mockValidateStoredFileJsonContent).not.toHaveBeenCalled();
    expect(mockCreateStoredFileDocument).not.toHaveBeenCalled();
    await fastify.close();
  });
});
