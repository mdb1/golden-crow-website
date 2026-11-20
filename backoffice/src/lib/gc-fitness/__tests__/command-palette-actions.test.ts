// command-palette-actions.test.ts — #496.
//
// The palette's index is an auth-checked read that is scoped to the caller:
// it must refuse (RETURN, #1104) with no trainer session and must only be built
// from the caller-scoped readers — never a raw collection read.

const mockGetCurrentTrainer = jest.fn();
jest.mock("@/lib/gc-fitness/auth-helpers", () => ({
  getCurrentTrainer: () => mockGetCurrentTrainer(),
}));
const mockListClients = jest.fn();
jest.mock("@/lib/gc-fitness/client-roster", () => ({
  listClients: () => mockListClients(),
}));
const mockListTemplates = jest.fn();
jest.mock("@/lib/gc-fitness/workout-template-actions", () => ({
  listWorkoutTemplates: () => mockListTemplates(),
}));
const mockListExercises = jest.fn();
jest.mock("@/lib/gc-fitness/exercise-list-actions", () => ({
  listExercisesForViewer: () => mockListExercises(),
}));

import { getCommandPaletteIndex } from "../command-palette-actions";
import { matchesQuery, localizedPaletteName } from "../command-palette-index";

beforeEach(() => {
  jest.clearAllMocks();
  mockGetCurrentTrainer.mockResolvedValue({ uid: "coach-1" });
  mockListClients.mockResolvedValue([
    { uid: "c1", email: "ana@x.com", displayName: "Ana", coachNickname: "Anita" },
    { uid: "c2", email: "b@x.com", displayName: "" },
    { uid: "mirror:p@x.com", email: "p@x.com", displayName: "Pending" },
  ]);
  mockListTemplates.mockResolvedValue({
    templates: [{ id: "t1", name: { en: "Legs", es: "Piernas" }, exerciseCount: 4, trainerId: "coach-1" }],
  });
  mockListExercises.mockResolvedValue({
    exercises: [{ id: "e1", name: { en: "Squat", es: "Sentadilla" }, description: { en: "long", es: "" } }],
  });
});

describe("getCommandPaletteIndex", () => {
  it("returns a failure (never throws) without a trainer session, and reads nothing", async () => {
    mockGetCurrentTrainer.mockRejectedValue(new Error("Forbidden"));
    await expect(getCommandPaletteIndex()).resolves.toEqual({ ok: false, error: "Forbidden" });
    expect(mockListClients).not.toHaveBeenCalled();
    expect(mockListTemplates).not.toHaveBeenCalled();
    expect(mockListExercises).not.toHaveBeenCalled();
  });

  it("builds a light, coach-scoped index (ids + names only, no pending mirrors)", async () => {
    const result = await getCommandPaletteIndex();
    expect(result).toEqual({
      ok: true,
      index: {
        clients: [
          { id: "c1", name: "Anita", email: "ana@x.com" },
          { id: "c2", name: "b@x.com", email: "b@x.com" },
        ],
        templates: [{ id: "t1", name: { en: "Legs", es: "Piernas" } }],
        exercises: [{ id: "e1", name: { en: "Squat", es: "Sentadilla" } }],
      },
    });
  });

  it("returns a failure when a reader throws", async () => {
    mockListExercises.mockRejectedValue(new Error("boom"));
    const result = await getCommandPaletteIndex();
    expect(result.ok).toBe(false);
  });
});

describe("palette search helpers", () => {
  it("matches every term, accent- and case-insensitively", () => {
    expect(matchesQuery("SENTADILLA bulg", "Sentadilla búlgara")).toBe(true);
    expect(matchesQuery("sentadilla press", "Sentadilla búlgara")).toBe(false);
    expect(matchesQuery("  ", "anything")).toBe(true);
  });

  it("shows the locale's name and falls back to the other language", () => {
    expect(localizedPaletteName({ en: "Squat", es: "Sentadilla" }, "es")).toBe("Sentadilla");
    expect(localizedPaletteName({ en: "Squat", es: "" }, "es")).toBe("Squat");
    expect(localizedPaletteName({ en: "", es: "Sentadilla" }, "en")).toBe("Sentadilla");
  });
});
