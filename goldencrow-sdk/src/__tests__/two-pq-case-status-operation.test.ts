export {};

type MockData = Record<string, unknown>;

const operations = new Map<string, MockData>();

function operationSnapshot(id: string) {
  const data = operations.get(id);
  return {
    id,
    exists: Boolean(data),
    data: () => data,
  };
}

jest.mock("../config/firebase.js", () => ({
  adminDbFor: jest.fn(() => ({
    collection: () => ({
      doc: (id: string) => ({
        get: async () => operationSnapshot(id),
        set: async (data: MockData) => {
          operations.set(id, { ...data });
        },
      }),
    }),
  })),
}));

describe("2PQ case-status operation progress", () => {
  beforeEach(() => {
    operations.clear();
  });

  it("persists each real stage and completes only after all updates", async () => {
    const {
      beginTwoPQCaseStatusOperation,
      completeTwoPQCaseStatusOperation,
      getTwoPQCaseStatusOperation,
      updateTwoPQCaseStatusOperation,
    } = await import(
      "../repositories/two-pq-case-status-operation.repository.js"
    );

    await beginTwoPQCaseStatusOperation({
      operationId: "operation-123456789",
      caseId: "CASE-00022",
      targetCaseStatus: "lab_processing",
      actorEmail: "Admin@Example.com",
    });
    await updateTwoPQCaseStatusOperation("operation-123456789", {
      step: "case",
      status: "success",
      detail: "Case saved.",
    });
    await updateTwoPQCaseStatusOperation("operation-123456789", {
      step: "samplings",
      status: "running",
    });
    await updateTwoPQCaseStatusOperation("operation-123456789", {
      step: "samplings",
      status: "success",
      detail: "2 sampling children updated.",
    });
    await updateTwoPQCaseStatusOperation("operation-123456789", {
      step: "file_storage",
      status: "skipped",
      detail: "Automatic synchronization is disabled.",
    });
    await updateTwoPQCaseStatusOperation("operation-123456789", {
      step: "report_code",
      status: "skipped",
      detail: "Automatic synchronization is disabled.",
    });
    const completed = await completeTwoPQCaseStatusOperation(
      "operation-123456789",
    );

    expect(completed).toMatchObject({
      id: "operation-123456789",
      caseId: "CASE-00022",
      actorEmail: "admin@example.com",
      status: "success",
      steps: [
        { key: "case", status: "success" },
        { key: "samplings", status: "success" },
        { key: "file_storage", status: "skipped" },
        { key: "report_code", status: "skipped" },
      ],
    });
    await expect(
      getTwoPQCaseStatusOperation("operation-123456789"),
    ).resolves.toEqual(completed);
  });

  it("marks the currently running stage as failed", async () => {
    const {
      beginTwoPQCaseStatusOperation,
      failTwoPQCaseStatusOperation,
      updateTwoPQCaseStatusOperation,
    } = await import(
      "../repositories/two-pq-case-status-operation.repository.js"
    );

    await beginTwoPQCaseStatusOperation({
      operationId: "operation-987654321",
      caseId: "CASE-00022",
      targetCaseStatus: "bioinformatics",
      actorEmail: "admin@example.com",
    });
    await updateTwoPQCaseStatusOperation("operation-987654321", {
      step: "case",
      status: "success",
    });
    await updateTwoPQCaseStatusOperation("operation-987654321", {
      step: "samplings",
      status: "running",
    });
    const failed = await failTwoPQCaseStatusOperation(
      "operation-987654321",
      new Error("Sampling write failed."),
    );

    expect(failed).toMatchObject({
      status: "error",
      errorMessage: "Sampling write failed.",
      steps: [
        { key: "case", status: "success" },
        {
          key: "samplings",
          status: "error",
          detail: "Sampling write failed.",
        },
        { key: "file_storage", status: "pending" },
        { key: "report_code", status: "pending" },
      ],
    });
  });
});
