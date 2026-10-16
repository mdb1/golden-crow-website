// __tests__/workout-template-and-exercise-media.fake-db.test.ts
//
// Executes duplicateWorkoutTemplate / getWorkoutTemplateForAssignment /
// countExerciseTemplateUsage (workout-template-actions.ts) and
// mintExerciseThumbnailUploadUrl (exercise-server-actions.ts) against the
// in-memory Firestore from fake-firestore-c and a recording Storage stub, with
// the real auth-helpers over a mocked getTokens. Asserts the WRITTEN template
// doc (fake-c throws on `undefined`, like the Admin SDK), the read projection,
// and that the signed upload URL is scoped to the caller's namespace + pinned
// to an image content type.

import {
  FakeFirestore,
  FakeTimestamp,
  setGcFitnessAuthEnv,
  tokensFor,
} from "@/lib/test-utils/fake-firestore-c";

const mockDb: { current: FakeFirestore | null } = { current: null };
const mockSigned: Array<{ bucket: string; path: string; options: Record<string, unknown> }> = [];

jest.mock("next/headers", () => ({
  cookies: jest.fn(async () => ({ get: () => undefined })),
}));
jest.mock("next/cache", () => ({ revalidateTag: jest.fn(), revalidatePath: jest.fn() }));
jest.mock("next-firebase-auth-edge", () => ({ getTokens: jest.fn() }));
jest.mock("@/lib/firebase/gc-fitness-admin", () => ({
  gcFitnessFirestore: () => mockDb.current,
  gcFitnessStorage: () => ({
    bucket: (bucket: string) => ({
      file: (path: string) => ({
        getSignedUrl: async (options: Record<string, unknown>) => {
          mockSigned.push({ bucket, path, options });
          return [`https://signed.example/${bucket}/${path}`];
        },
      }),
    }),
  }),
}));
jest.mock("firebase-admin/firestore", () =>
  jest.requireActual("@/lib/test-utils/fake-firestore-c").firestoreModuleMock,
);

import { getTokens } from "next-firebase-auth-edge";

import {
  countExerciseTemplateUsage,
  duplicateWorkoutTemplate,
  getWorkoutTemplateForAssignment,
} from "../workout-template-actions";
import { mintExerciseThumbnailUploadUrl } from "../exercise-server-actions";

const mockedGetTokens = getTokens as jest.MockedFunction<typeof getTokens>;
let db: FakeFirestore;

function signInAs(uid: string, roles: string[]) {
  mockedGetTokens.mockResolvedValue(tokensFor(uid, roles) as never);
}

function expectNoUndefinedDeep(value: unknown, path = "$"): void {
  if (value === undefined) throw new Error(`undefined at ${path}`);
  if (Array.isArray(value)) value.forEach((v, i) => expectNoUndefinedDeep(v, `${path}[${i}]`));
  else if (value && typeof value === "object" && !(value instanceof FakeTimestamp)) {
    for (const [k, v] of Object.entries(value)) expectNoUndefinedDeep(v, `${path}.${k}`);
  }
}

const EXERCISES = [
  { exerciseId: "ex-old", sets: 4, reps: 8, rest_seconds: 90, weightBySetKg: [50, 50, "x", 55], setTypesBySet: ["warmup", 7, "normal", "failure"], supersetGroup: " A ", notes: "slow" },
  { exerciseId: "ex-plank", metric: "time", durationBySetSeconds: [30, 45], durationSeconds: 40, weightBySetKg: [], transitionRestSeconds: 9999 },
  { exerciseId: "ex-missing" },
];

beforeEach(() => {
  setGcFitnessAuthEnv();
  delete process.env.NEXT_PUBLIC_GC_FITNESS_FIREBASE_STORAGE_BUCKET;
  db = new FakeFirestore();
  mockDb.current = db;
  mockSigned.length = 0;
  mockedGetTokens.mockReset();
  signInAs("coach-a", ["trainer"]);

  db.seed("exercises/ex-old", { name: { en: "Old squat", es: "Sentadilla vieja" }, mergedInto: "ex-squat" });
  db.seed("exercises/ex-squat", { name: { en: "Squat", es: "Sentadilla" }, gifUrl: "https://g/squat.gif", muscleGroups: ["quads", "", 3], primaryMuscleGroup: "quads", secondaryMuscles: ["glutes"] });
  db.seed("exercises/ex-plank", { name: { en: "", es: "Plancha" }, metric: "time", thumbnailURL: "https://g/plank.png" });

  db.seed("workout_templates/t-own", {
    id: "t-own",
    trainerId: "coach-a",
    isStandard: false,
    name: { en: "Legs", es: "Piernas" },
    description: { en: "d", es: "d" },
    tags: ["strength", "  "],
    tag: "strength",
    exercises: EXERCISES,
    version: 7,
    deleted: false,
    createdAt: new FakeTimestamp(0),
    estimatedDurationMinutes: 55,
  });
  db.seed("workout_templates/t-std", { trainerId: "__standard__", isStandard: true, name: { en: "Full body", es: "Cuerpo completo" }, tag: "hypertrophy", exercises: [{ exerciseId: "ex-squat" }], endsOn: "2026-12-31" });
  db.seed("workout_templates/t-b", { trainerId: "coach-b", isStandard: false, name: { en: "B secret", es: "B secreto" }, exercises: [{ exerciseId: "ex-squat" }] });
});

describe("auth gate", () => {
  it.each([
    ["duplicateWorkoutTemplate", () => duplicateWorkoutTemplate("t-own")],
    ["getWorkoutTemplateForAssignment", () => getWorkoutTemplateForAssignment("t-own")],
    ["countExerciseTemplateUsage", () => countExerciseTemplateUsage()],
    ["mintExerciseThumbnailUploadUrl", () => mintExerciseThumbnailUploadUrl({ exerciseId: "custom-coach-a-1", contentLength: 10, contentType: "image/png" })],
  ] as Array<[string, () => Promise<unknown>]>)("%s: signed-out / client / admin-only → Forbidden, no I/O", async (_n, call) => {
    for (const roles of [null, ["client"], ["admin"]]) {
      if (roles === null) mockedGetTokens.mockResolvedValue(null as never);
      else signInAs("x", roles);
      await expect(call()).rejects.toThrow("Forbidden");
    }
    expect(db.writes).toEqual([]);
    expect(db.reads).toEqual([]);
    expect(db.queries).toEqual([]);
    expect(mockSigned).toEqual([]);
  });
});

describe("duplicateWorkoutTemplate", () => {
  it("copies MY template into a fresh trainer-owned doc: suffixed names, version 1, provenance, no undefined", async () => {
    const { id } = await duplicateWorkoutTemplate("t-own");
    expect(id).toMatch(/^tpl-coach-a-[0-9a-f-]{36}$/);
    const doc = db.doc(`workout_templates/${id}`)!;
    expect(doc).toMatchObject({
      id,
      name: { en: "Legs (copy)", es: "Piernas (copia)" },
      description: { en: "d", es: "d" },
      tag: "strength",
      tags: ["strength"],
      exercises: EXERCISES,
      trainerId: "coach-a",
      isStandard: false,
      sourceTemplateId: "t-own",
      version: 1,
      deleted: false,
    });
    expect("endsOn" in doc).toBe(false); // absent on the source → never written as undefined
    expect(doc.createdAt).toBeInstanceOf(FakeTimestamp);
    expect((doc.createdAt as FakeTimestamp).toMillis()).toBe(db.now);
    expect(doc.updatedAt).toBeInstanceOf(FakeTimestamp);
    expectNoUndefinedDeep(doc);
    // the source is untouched
    expect(db.doc("workout_templates/t-own")!.version).toBe(7);
    expect(db.writesTo("workout_templates/").map((w) => w.path)).toEqual([`workout_templates/${id}`]);
  });

  it("a standard template duplicates like a fork (legacy single `tag`, endsOn carried, default description)", async () => {
    const { id } = await duplicateWorkoutTemplate("t-std");
    const doc = db.doc(`workout_templates/${id}`)!;
    expect(doc).toMatchObject({
      name: { en: "Full body (copy)", es: "Cuerpo completo (copia)" },
      description: { en: "", es: "" },
      tag: "hypertrophy",
      tags: ["hypertrophy"],
      endsOn: "2026-12-31",
      trainerId: "coach-a",
      isStandard: false,
      sourceTemplateId: "t-std",
    });
    expectNoUndefinedDeep(doc);
  });

  it("refuses another coach's template and a missing one with no write", async () => {
    await expect(duplicateWorkoutTemplate("t-b")).rejects.toThrow("Not your template.");
    await expect(duplicateWorkoutTemplate("ghost")).rejects.toThrow("Template not found");
    expect(db.writes).toEqual([]);
  });
});

describe("getWorkoutTemplateForAssignment", () => {
  it("projects each exercise with merged-into names, media, metric cascade inputs, and positional set types", async () => {
    const out = await getWorkoutTemplateForAssignment("t-own");
    expect(out.id).toBe("t-own");
    expect(out.name).toEqual({ en: "Legs", es: "Piernas" });
    expect(out.exercises).toEqual([
      {
        index: 0,
        exerciseId: "ex-old",
        exerciseName: "Squat", // followed mergedInto → canonical doc
        sets: 4,
        reps: 8,
        rest_seconds: 90,
        transition_rest_seconds: 60,
        notes: "slow",
        repsBySet: [],
        weightBySetKg: [50, 50, 55],
        setTypesBySet: ["warmup", "", "normal", "failure"], // positional, never filtered
        hasExplicitNoWeightPrescription: false,
        previewUrl: "https://g/squat.gif",
        supersetGroup: "A",
        sourceMetric: "reps",
        muscles: { muscleGroups: ["quads"], primaryMuscleGroup: "quads", secondaryMuscles: ["glutes"] },
      },
      {
        index: 1,
        exerciseId: "ex-plank",
        exerciseName: "Plancha",
        sets: 3,
        reps: 10,
        rest_seconds: 60,
        transition_rest_seconds: 600, // clamped
        notes: "",
        repsBySet: [],
        weightBySetKg: [],
        setTypesBySet: [],
        hasExplicitNoWeightPrescription: true,
        previewUrl: "https://g/plank.png",
        supersetGroup: null,
        metric: "time",
        sourceMetric: "time",
        durationBySetSeconds: [30, 45],
        durationSeconds: 40,
        muscles: { muscleGroups: [], secondaryMuscles: [] },
      },
      {
        index: 2,
        exerciseId: "ex-missing",
        exerciseName: "ex-missing",
        sets: 3,
        reps: 10,
        rest_seconds: 60,
        transition_rest_seconds: 60,
        notes: "",
        repsBySet: [],
        weightBySetKg: [],
        setTypesBySet: [],
        hasExplicitNoWeightPrescription: false,
        previewUrl: null,
        supersetGroup: null,
        sourceMetric: "reps",
        muscles: { muscleGroups: [], secondaryMuscles: [] },
      },
    ]);
    expect(db.writes).toEqual([]);
  });

  it("a standard template is readable; another coach's / a missing template is refused", async () => {
    await expect(getWorkoutTemplateForAssignment("t-std")).resolves.toMatchObject({ id: "t-std" });
    await expect(getWorkoutTemplateForAssignment("t-b")).rejects.toThrow("Not your template.");
    await expect(getWorkoutTemplateForAssignment("ghost")).rejects.toThrow("Template not found.");
  });
});

describe("countExerciseTemplateUsage", () => {
  it("counts templates per exercise across MY + standard templates, once per template, skipping deleted and other coaches'", async () => {
    db.seed("workout_templates/t-own-2", { trainerId: "coach-a", exercises: [{ exerciseId: "ex-squat" }, { exerciseId: "ex-squat" }] });
    db.seed("workout_templates/t-own-del", { trainerId: "coach-a", deleted: true, exercises: [{ exerciseId: "ex-plank" }] });
    await expect(countExerciseTemplateUsage()).resolves.toEqual({
      "ex-old": 1,
      "ex-plank": 1,
      "ex-missing": 1,
      "ex-squat": 2, // t-own-2 (deduped within the template) + t-std; t-b is coach-b's
    });
    expect(db.writes).toEqual([]);
  });
});

describe("mintExerciseThumbnailUploadUrl", () => {
  it.each([
    ["image/jpeg", "jpg"],
    ["image/png", "png"],
    ["image/webp", "webp"],
    ["image/gif", "gif"],
  ])("%s → a write URL under the caller's namespace pinned to that content type", async (contentType, ext) => {
    const before = Date.now();
    const out = await mintExerciseThumbnailUploadUrl({ exerciseId: "custom-coach-a-abc", contentLength: 5 * 1024 * 1024, contentType });
    expect(out.gsPath).toBe(`gs://gcfitness-3476b.firebasestorage.app/exercises/custom-coach-a-abc-thumb.${ext}`);
    expect(mockSigned).toHaveLength(1);
    const { path, options } = mockSigned[0];
    expect(path).toBe(`exercises/custom-coach-a-abc-thumb.${ext}`);
    expect(options).toMatchObject({ version: "v4", action: "write", contentType });
    const ttl = (options.expires as number) - before;
    expect(ttl).toBeGreaterThan(59 * 60 * 1000);
    expect(ttl).toBeLessThanOrEqual(60 * 60 * 1000 + 1000);
    expect(db.writes).toEqual([]);
  });

  it("honours the configured bucket", async () => {
    process.env.NEXT_PUBLIC_GC_FITNESS_FIREBASE_STORAGE_BUCKET = "my-bucket";
    const out = await mintExerciseThumbnailUploadUrl({ exerciseId: "custom-coach-a-abc", contentLength: 1, contentType: "image/png" });
    expect(out.gsPath).toBe("gs://my-bucket/exercises/custom-coach-a-abc-thumb.png");
  });

  it.each([
    ["another coach's exercise", "custom-coach-b-abc"],
    ["a wger / standard exercise", "wger-123"],
    ["a std library id", "std-squat"],
    ["the bare prefix of my uid without the dash", "custom-coach-a"],
    ["an empty id", ""],
  ])("refuses %s without minting", async (_label, exerciseId) => {
    await expect(mintExerciseThumbnailUploadUrl({ exerciseId, contentLength: 10, contentType: "image/png" })).rejects.toThrow();
    expect(mockSigned).toEqual([]);
  });

  it.each([
    ["image/svg+xml"],
    ["text/html"],
    ["video/mp4"],
    ["IMAGE/PNG"],
    [""],
  ])("refuses content type %j without minting", async (contentType) => {
    await expect(mintExerciseThumbnailUploadUrl({ exerciseId: "custom-coach-a-abc", contentLength: 10, contentType })).rejects.toThrow("BadRequest: contentType");
    expect(mockSigned).toEqual([]);
  });

  it.each([[0], [-1], [Number.NaN], [Number.POSITIVE_INFINITY], [5 * 1024 * 1024 + 1], ["10" as unknown as number]])(
    "refuses contentLength %p without minting",
    async (contentLength) => {
      await expect(mintExerciseThumbnailUploadUrl({ exerciseId: "custom-coach-a-abc", contentLength, contentType: "image/png" })).rejects.toThrow();
      expect(mockSigned).toEqual([]);
    },
  );

  // BUG: the allowlist is a plain object literal looked up with `[contentType]`
  // (exercise-server-actions.ts:82 + :550), so inherited Object.prototype keys pass
  // the "known image MIME" check: `contentType: "constructor"` yields a truthy ext
  // (the Object function) and a signed write URL is minted with
  // `contentType: "constructor"` at `exercises/<id>-thumb.function Object() {…}`.
  // Correct: only the four own image keys are accepted.
  it.failing.each([["constructor"], ["toString"], ["__proto__"]])(
    "refuses prototype-key content type %j without minting",
    async (contentType) => {
      await expect(
        mintExerciseThumbnailUploadUrl({ exerciseId: "custom-coach-a-abc", contentLength: 10, contentType }),
      ).rejects.toThrow();
      expect(mockSigned).toEqual([]);
    },
  );

  // BUG (cost-DoS): the 5 MB cap is only checked against the CALLER-DECLARED
  // contentLength (exercise-server-actions.ts:538-547); the signed URL itself
  // (:562-567) does not bind the size (no `x-goog-content-length-range`
  // extension header), so whoever holds the URL can PUT an object of any size for
  // the next 60 minutes after declaring `contentLength: 1`. Correct: pin the
  // range into the signature.
  it.failing("binds the 5 MB ceiling into the signed URL itself", async () => {
    await mintExerciseThumbnailUploadUrl({ exerciseId: "custom-coach-a-abc", contentLength: 1, contentType: "image/png" });
    const headers = (mockSigned[0].options.extensionHeaders ?? {}) as Record<string, string>;
    expect(headers["x-goog-content-length-range"]).toBe(`0,${5 * 1024 * 1024}`);
  });
});
