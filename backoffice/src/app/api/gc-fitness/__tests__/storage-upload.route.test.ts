// __tests__/storage-upload.route.test.ts
//
// POST /api/gc-fitness/habits/photo and POST /api/gc-fitness/coach-profile-photo
// — the two Admin-SDK upload routes (which bypass storage.rules). Pins auth,
// size/type limits, ownership, the object path that gets WRITTEN, and the
// response shape. `saved` records every Storage write with its options.

import {
  FakeFirestore,
  setGcFitnessAuthEnv,
  tokensFor,
} from "@/lib/test-utils/fake-firestore-c";

const mockDb: { current: FakeFirestore | null } = { current: null };
const saved: Array<{ bucket: string; object: string; bytes: Buffer; options: Record<string, unknown> }> = [];
const failBuckets = new Set<string>();

jest.mock("next/headers", () => ({
  cookies: jest.fn(async () => ({ get: () => undefined })),
}));
jest.mock("next-firebase-auth-edge", () => ({ getTokens: jest.fn() }));
jest.mock("@/lib/firebase/gc-fitness-admin", () => ({
  gcFitnessFirestore: () => mockDb.current,
  gcFitnessStorage: () => ({
    bucket: (bucket: string) => ({
      file: (object: string) => ({
        save: async (bytes: Buffer, options: Record<string, unknown>) => {
          if (failBuckets.has(bucket)) throw new Error("bucket unavailable");
          saved.push({ bucket, object, bytes, options });
        },
      }),
    }),
  }),
}));
jest.mock("node:crypto", () => ({
  ...jest.requireActual("node:crypto"),
  randomUUID: () => "tok-uuid",
}));

import { getTokens } from "next-firebase-auth-edge";

import { POST as habitPhoto } from "@/app/api/gc-fitness/habits/photo/route";
import { POST as coachPhoto } from "@/app/api/gc-fitness/coach-profile-photo/route";

const mockGetTokens = getTokens as jest.MockedFunction<typeof getTokens>;
const BUCKET = "gcfitness-test.firebasestorage.app";

function signIn(roles: string[], uid = "coach-a") {
  mockGetTokens.mockResolvedValue(tokensFor(uid, roles) as Awaited<ReturnType<typeof getTokens>>);
}

let errSpy: jest.SpyInstance;
beforeEach(() => {
  mockDb.current = new FakeFirestore();
  saved.length = 0;
  failBuckets.clear();
  mockGetTokens.mockReset();
  setGcFitnessAuthEnv();
  delete process.env.NEXT_PUBLIC_GC_FITNESS_FIREBASE_STORAGE_BUCKET;
  signIn(["trainer"]);
  errSpy = jest.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => errSpy.mockRestore());

// ─────────────────────────────────────────────────────────────────────────────
describe("POST /api/gc-fitness/habits/photo", () => {
  function upload(opts: { habitId?: string; type?: string; size?: number; file?: false }): Request {
    const fd = new FormData();
    if (opts.habitId !== undefined) fd.set("habitId", opts.habitId);
    if (opts.file !== false) {
      const bytes = new Uint8Array(opts.size ?? 4).fill(7);
      fd.set("file", new File([bytes], "p", { type: opts.type ?? "image/jpeg" }));
    }
    return new Request("https://backoffice.test/api/gc-fitness/habits/photo", {
      method: "POST",
      body: fd,
    });
  }

  beforeEach(() => {
    process.env.NEXT_PUBLIC_GC_FITNESS_FIREBASE_STORAGE_BUCKET = "media-bucket";
    mockDb.current!
      .seed("habits/h-mine", { trainerId: "coach-a" })
      .seed("habits/h-theirs", { trainerId: "coach-b" })
      .seed("habit_templates/t-mine", { trainerId: "coach-a" })
      .seed("habit_templates/t-theirs", { trainerId: "coach-b" });
  });

  it("no session → 403, nothing saved", async () => {
    mockGetTokens.mockResolvedValue(null);
    const res = await habitPhoto(upload({ habitId: "h-mine" }));
    expect(res.status).toBe(403);
    expect(saved).toEqual([]);
  });

  it("client token → 403", async () => {
    signIn(["client"]);
    const res = await habitPhoto(upload({ habitId: "h-mine" }));
    expect(res.status).toBe(403);
    expect(saved).toEqual([]);
  });

  it("own habit: saves habits/{id}/photo.jpg with the content type and returns its gs:// path", async () => {
    const res = await habitPhoto(upload({ habitId: "h-mine", size: 5 }));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      ok: true,
      gsPath: "gs://media-bucket/habits/h-mine/photo.jpg",
    });
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({
      bucket: "media-bucket",
      object: "habits/h-mine/photo.jpg",
      options: { resumable: false, metadata: { contentType: "image/jpeg" } },
    });
    expect(saved[0].bytes).toEqual(Buffer.alloc(5, 7));
  });

  it.each([
    ["image/png", "png"],
    ["image/webp", "webp"],
  ])("%s → .%s extension", async (type, ext) => {
    const res = await habitPhoto(upload({ habitId: "t-mine", type }));
    expect(res.status).toBe(200);
    expect(saved[0].object).toBe(`habits/t-mine/photo.${ext}`);
  });

  it("falls back to the gcfitness-3476b media bucket when the env bucket is unset", async () => {
    delete process.env.NEXT_PUBLIC_GC_FITNESS_FIREBASE_STORAGE_BUCKET;
    const res = await habitPhoto(upload({ habitId: "h-mine" }));
    await expect(res.json()).resolves.toMatchObject({
      gsPath: "gs://gcfitness-3476b.firebasestorage.app/habits/h-mine/photo.jpg",
    });
  });

  it.each([
    ["another coach's habit", "h-theirs"],
    ["another coach's template", "t-theirs"],
    ["a habit that does not exist", "h-ghost"],
    ["another coach's draft namespace", "habit-draft-coach-b-123"],
    ["another coach's template-draft namespace", "habit-template-coach-b-123"],
  ])("%s → 403, nothing saved", async (_label, habitId) => {
    const res = await habitPhoto(upload({ habitId }));
    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({ error: "Forbidden" });
    expect(saved).toEqual([]);
  });

  it.each(["habit-draft-coach-a-1700000000", "habit-template-coach-a-1700000000"])(
    "own draft id %s (no doc yet) is allowed",
    async (habitId) => {
      const res = await habitPhoto(upload({ habitId }));
      expect(res.status).toBe(200);
      expect(saved[0].object).toBe(`habits/${habitId}/photo.jpg`);
    },
  );

  it("draft ids skip the Firestore ownership read entirely", async () => {
    await habitPhoto(upload({ habitId: "habit-draft-coach-a-1" }));
    expect(mockDb.current!.reads).toEqual([]);
  });

  it.each([
    ["missing habitId", { file: undefined }, "Missing habitId"],
    ["blank habitId", { habitId: "   " }, "Missing habitId"],
    ["missing file", { habitId: "h-mine", file: false as const }, "Missing file"],
  ])("%s → 400", async (_label, opts, error) => {
    const res = await habitPhoto(upload(opts));
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error });
    expect(saved).toEqual([]);
  });

  it.each(["image/gif", "image/svg+xml", "text/html", "application/octet-stream"])(
    "type %s → 400 Unsupported image type",
    async (type) => {
      const res = await habitPhoto(upload({ habitId: "h-mine", type }));
      expect(res.status).toBe(400);
      await expect(res.json()).resolves.toEqual({ error: "Unsupported image type" });
      expect(saved).toEqual([]);
    },
  );

  it("exactly 10 MB is accepted; 10 MB + 1 → 413; empty → 413", async () => {
    const ten = 10 * 1024 * 1024;
    expect((await habitPhoto(upload({ habitId: "h-mine", size: ten }))).status).toBe(200);
    const over = await habitPhoto(upload({ habitId: "h-mine", size: ten + 1 }));
    expect(over.status).toBe(413);
    await expect(over.json()).resolves.toEqual({ error: "File too large" });
    expect((await habitPhoto(upload({ habitId: "h-mine", size: 0 }))).status).toBe(413);
    expect(saved).toHaveLength(1);
  });

  it("storage failure → 500 Upload failed", async () => {
    failBuckets.add("media-bucket");
    const res = await habitPhoto(upload({ habitId: "h-mine" }));
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({ error: "Upload failed" });
  });

  it("non-multipart body → rejects (Next turns it into a 500)", async () => {
    const req = new Request("https://backoffice.test/api/gc-fitness/habits/photo", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    await expect(habitPhoto(req)).rejects.toThrow();
    expect(saved).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("POST /api/gc-fitness/coach-profile-photo", () => {
  function upload(bytes: number, type = "image/jpeg"): Request {
    return new Request("https://backoffice.test/api/gc-fitness/coach-profile-photo", {
      method: "POST",
      headers: type ? { "content-type": type } : {},
      body: new Uint8Array(bytes).fill(1),
    });
  }

  it("no session → 403, nothing saved", async () => {
    mockGetTokens.mockResolvedValue(null);
    const res = await coachPhoto(upload(10));
    expect(res.status).toBe(403);
    expect(saved).toEqual([]);
  });

  it("client token → 403", async () => {
    signIn(["client"], "client-1");
    const res = await coachPhoto(upload(10));
    expect(res.status).toBe(403);
    expect(saved).toEqual([]);
  });

  it("writes ONLY profile_photos/{callerUid}/avatar.jpg and returns a tokened download URL", async () => {
    const res = await coachPhoto(upload(10));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      photoURL:
        `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/` +
        `${encodeURIComponent("profile_photos/coach-a/avatar.jpg")}?alt=media&token=tok-uuid`,
    });
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({
      bucket: BUCKET,
      object: "profile_photos/coach-a/avatar.jpg",
      options: {
        contentType: "image/jpeg",
        metadata: {
          cacheControl: "public, max-age=300",
          metadata: { firebaseStorageDownloadTokens: "tok-uuid" },
        },
      },
    });
  });

  it("the target path ignores anything in the request — always the caller's own uid", async () => {
    const req = new Request(
      "https://backoffice.test/api/gc-fitness/coach-profile-photo?uid=coach-b&path=profile_photos/coach-b/avatar.jpg",
      { method: "POST", headers: { "content-type": "image/png" }, body: new Uint8Array(3) },
    );
    await coachPhoto(req);
    expect(saved.map((s) => s.object)).toEqual(["profile_photos/coach-a/avatar.jpg"]);
  });

  it.each(["text/plain", "application/octet-stream", ""])("content-type %j → 415", async (type) => {
    const res = await coachPhoto(upload(10, type));
    expect(res.status).toBe(415);
    await expect(res.json()).resolves.toEqual({ error: "Expected an image body" });
    expect(saved).toEqual([]);
  });

  it("empty body → 400; exactly 2 MB OK; 2 MB + 1 → 413", async () => {
    expect((await coachPhoto(upload(0))).status).toBe(400);
    expect((await coachPhoto(upload(2 * 1024 * 1024))).status).toBe(200);
    const big = await coachPhoto(upload(2 * 1024 * 1024 + 1));
    expect(big.status).toBe(413);
    await expect(big.json()).resolves.toEqual({ error: "Image too large" });
    expect(saved).toHaveLength(1);
  });

  it("falls through bucket candidates and reports the bucket that took the write", async () => {
    process.env.NEXT_PUBLIC_GC_FITNESS_FIREBASE_STORAGE_BUCKET = "configured";
    failBuckets.add("configured");
    const res = await coachPhoto(upload(10));
    const { photoURL } = (await res.json()) as { photoURL: string };
    expect(photoURL).toContain(`/b/${BUCKET}/o/`);
    expect(saved[0].bucket).toBe(BUCKET);
  });

  it("every bucket fails → 502", async () => {
    failBuckets.add(BUCKET).add("gcfitness-test.appspot.com");
    const res = await coachPhoto(upload(10));
    expect(res.status).toBe(502);
    await expect(res.json()).resolves.toEqual({ error: "Upload failed" });
  });

  it.failing(
    "SECURITY GAP: an image/svg+xml body is accepted and stored as the coach avatar (served same-origin by storage-image)",
    async () => {
      const res = await coachPhoto(upload(10, "image/svg+xml"));
      expect(res.status).toBe(415);
      expect(saved).toEqual([]);
    },
  );
});
