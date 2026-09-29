import { resolveMissingTwoPQAssignedEntities } from "../lib/two-pq-assignment-integrity.js";

describe("2PQ assigned-entity integrity", () => {
  it("reports every missing entity referenced by the record", () => {
    expect(
      resolveMissingTwoPQAssignedEntities(
        {
          institutionId: "INST-REMOVED",
          doctorId: "DOC-REMOVED",
          patientId: "PAT-REMOVED",
        },
        {
          institutionExists: false,
          doctorExists: false,
          patientExists: false,
        },
      ),
    ).toEqual([
      { kind: "institution", id: "INST-REMOVED" },
      { kind: "doctor", id: "DOC-REMOVED" },
      { kind: "patient", id: "PAT-REMOVED" },
    ]);
  });

  it("does not require a patient when the record has no patient assignment", () => {
    expect(
      resolveMissingTwoPQAssignedEntities(
        {
          institutionId: "INST-00001",
          doctorId: "DOC-00001",
        },
        {
          institutionExists: true,
          doctorExists: true,
          patientExists: false,
        },
      ),
    ).toEqual([]);
  });
});
