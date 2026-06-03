// __tests__/workout-assignment-schema.test.ts
// Zod-shape tests for the workout-assignment schemas in 04-05.
//
// Coverage:
//   - assignTemplateSchema: accepts the happy path, rejects malformed
//     scheduledFor strings, missing fields.
//   - bulkAssignSchema: accepts the happy path, rejects empty client lists,
//     enforces the 166-client cap (Pitfall 5).
//   - editAssignmentSchema: accepts ONLY scheduledFor; .strict() rejects
//     any other key (defense-in-depth on top of the rule layer from 04-02).

import {
  assignTemplateSchema,
  bulkAssignSchema,
  editAssignmentSchema,
  MAX_CLIENTS_PER_BATCH,
} from "../workout-assignment-schema";

describe("assignTemplateSchema", () => {
  it("accepts a fully-populated valid input", () => {
    const result = assignTemplateSchema.safeParse({
      templateId: "tpl-trainer-abc-uuid",
      clientId: "client-uid-1",
      scheduledFor: "2026-06-01",
      scheduledTime: "19:30",
      meetingNotes: "Meet on Google Meet.",
      timezone: "America/Mexico_City",
      exerciseOverrides: [
        {
          index: 0,
          rest_seconds: 45,
          transition_rest_seconds: 75,
          notes: "Tempo control",
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("accepts a valid input without the optional timezone field", () => {
    const result = assignTemplateSchema.safeParse({
      templateId: "tpl-abc",
      clientId: "client-1",
      scheduledFor: "2026-06-01",
      scheduledTime: "07:45",
    });
    expect(result.success).toBe(true);
  });

  it("rejects scheduledFor with unpadded month '2026-6-1'", () => {
    const result = assignTemplateSchema.safeParse({
      templateId: "tpl-abc",
      clientId: "client-1",
      scheduledFor: "2026-6-1",
    });
    expect(result.success).toBe(false);
  });

  it("rejects scheduledFor with non-date string", () => {
    const result = assignTemplateSchema.safeParse({
      templateId: "tpl-abc",
      clientId: "client-1",
      scheduledFor: "not-a-date",
    });
    expect(result.success).toBe(false);
  });

  it("rejects scheduledFor with extra time suffix", () => {
    const result = assignTemplateSchema.safeParse({
      templateId: "tpl-abc",
      clientId: "client-1",
      scheduledFor: "2026-06-01T12:00:00Z",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing templateId", () => {
    const result = assignTemplateSchema.safeParse({
      clientId: "client-1",
      scheduledFor: "2026-06-01",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty string clientId", () => {
    const result = assignTemplateSchema.safeParse({
      templateId: "tpl-abc",
      clientId: "",
      scheduledFor: "2026-06-01",
    });
    expect(result.success).toBe(false);
  });
});

describe("bulkAssignSchema", () => {
  it("accepts a valid input with multiple clients", () => {
    const result = bulkAssignSchema.safeParse({
      templateId: "tpl-abc",
      clientIds: ["c1", "c2", "c3"],
      scheduledFor: "2026-06-01",
      scheduledTime: "17:00",
      meetingNotes: "Bring your laptop.",
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty clientIds array", () => {
    const result = bulkAssignSchema.safeParse({
      templateId: "tpl-abc",
      clientIds: [],
      scheduledFor: "2026-06-01",
    });
    expect(result.success).toBe(false);
  });

  it(`accepts exactly ${MAX_CLIENTS_PER_BATCH} clients at the cap edge`, () => {
    const clientIds = Array.from(
      { length: MAX_CLIENTS_PER_BATCH },
      (_, i) => `c-${i}`,
    );
    const result = bulkAssignSchema.safeParse({
      templateId: "tpl-abc",
      clientIds,
      scheduledFor: "2026-06-01",
    });
    expect(result.success).toBe(true);
  });

  it(`rejects ${MAX_CLIENTS_PER_BATCH + 1} clients (over the cap)`, () => {
    const clientIds = Array.from(
      { length: MAX_CLIENTS_PER_BATCH + 1 },
      (_, i) => `c-${i}`,
    );
    const result = bulkAssignSchema.safeParse({
      templateId: "tpl-abc",
      clientIds,
      scheduledFor: "2026-06-01",
    });
    expect(result.success).toBe(false);
  });

  it("rejects malformed scheduledFor in bulk input", () => {
    const result = bulkAssignSchema.safeParse({
      templateId: "tpl-abc",
      clientIds: ["c1"],
      scheduledFor: "2026/06/01",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty-string clientId entries", () => {
    const result = bulkAssignSchema.safeParse({
      templateId: "tpl-abc",
      clientIds: ["c1", ""],
      scheduledFor: "2026-06-01",
    });
    expect(result.success).toBe(false);
  });
});

describe("editAssignmentSchema", () => {
  it("accepts a valid scheduledFor-only edit", () => {
    const result = editAssignmentSchema.safeParse({
      scheduledFor: "2026-06-15",
      scheduledTime: "18:00",
      meetingNotes: "Zoom link in notes.",
    });
    expect(result.success).toBe(true);
  });

  it("rejects extra fields (defense-in-depth WTPL-07)", () => {
    const result = editAssignmentSchema.safeParse({
      scheduledFor: "2026-06-15",
      templateSnapshot: { name: { en: "evil", es: "evil" } },
    });
    expect(result.success).toBe(false);
  });

  it("rejects status mutations (P05 surface, not P04)", () => {
    const result = editAssignmentSchema.safeParse({
      scheduledFor: "2026-06-15",
      status: "started",
    });
    expect(result.success).toBe(false);
  });

  it("rejects malformed scheduledFor on edit too", () => {
    const result = editAssignmentSchema.safeParse({
      scheduledFor: "2026-6-1",
    });
    expect(result.success).toBe(false);
  });
});
