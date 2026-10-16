// __tests__/storage-read.route.test.ts
//
// GET /api/gc-fitness/storage-image and GET /api/gc-fitness/photo-proxy —
// the two same-origin byte proxies that read Storage with the Admin SDK
// (which bypasses storage.rules). The route code is the ONLY boundary, so
// these tests try to read objects a coach must not reach: other prefixes,
// another bucket, `..` traversal and encoded variants, and another coach's
// client's progress photo. Every deny test also asserts that NO Storage
// object was even opened (`opened` stays empty).

import {
  FakeFirestore,
  setGcFitnessAuthEnv,
  tokensFor,
} from "@/lib/test-utils/fake-firestore-c";

const mockDb: { current: FakeFirestore | null } = { current: null };
// bucket → object → { bytes, contentType }
const mockObjects = new Map<string, { bytes: Buffer; contentType?: string }>();
const opened: string[] = [];

jest.mock("next/headers", () => ({
  cookies: jest.fn(async () => ({ get: () => undefined })),
}));
jest.mock("next-firebase-auth-edge", () => ({ getTokens: jest.fn() }));
jest.mock("@/lib/firebase/gc-fitness-admin", () => ({
  gcFitnessFirestore: () => mockDb.current,
  gcFitnessStorage: () => ({
    bucket: (bucket: string) => ({
      file: (object: string) => {
        const key = `${bucket}::${object}`;
        opened.push(key);
        return {
          download: async () => {
            const o = mockObjects.get(key);
            if (!o) throw new Error("404 No such object");
            return [o.bytes];
          },
          getMetadata: async () => [{ contentType: mockObjects.get(key)?.contentType }],
        };
      },
    }),
  }),
}));

import { getTokens } from "next-firebase-auth-edge";

import { GET as storageImage } from "@/app/api/gc-fitness/storage-image/route";
import { GET as photoProxy } from "@/app/api/gc-fitness/photo-proxy/route";

const mockGetTokens = getTokens as jest.MockedFunction<typeof getTokens>;

const BUCKET = "gcfitness-test.firebasestorage.app";
const LEGACY_BUCKET = "gcfitness-test.appspot.com";

function put(bucket: string, object: string, body: string, contentType?: string) {
  mockObjects.set(`${bucket}::${object}`, { bytes: Buffer.from(body), contentType });
}

function signIn(roles: string[], uid = "coach-a") {
  mockGetTokens.mockResolvedValue(tokensFor(uid, roles) as Awaited<ReturnType<typeof getTokens>>);
}

function imageReq(rawQuery: string): Request {
  return new Request(`https://backoffice.test/api/gc-fitness/storage-image?${rawQuery}`);
}

function imagePath(path: string): Request {
  return imageReq(`path=${encodeURIComponent(path)}`);
}

beforeEach(() => {
  mockDb.current = new FakeFirestore();
  mockObjects.clear();
  opened.length = 0;
  mockGetTokens.mockReset();
  setGcFitnessAuthEnv();
  delete process.env.NEXT_PUBLIC_GC_FITNESS_FIREBASE_STORAGE_BUCKET;
  signIn(["trainer"]);
});

// ─────────────────────────────────────────────────────────────────────────────
describe("GET /api/gc-fitness/storage-image — auth", () => {
  it("no session → 403 before the path is even parsed", async () => {
    mockGetTokens.mockResolvedValue(null);
    const res = await storageImage(imagePath("habits/h1/photo.jpg"));
    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({ error: "Forbidden" });
    expect(opened).toEqual([]);
  });

  it("signed-in CLIENT (not trainer) → 403", async () => {
    signIn(["client"]);
    put(BUCKET, "habits/h1/photo.jpg", "x");
    const res = await storageImage(imagePath("habits/h1/photo.jpg"));
    expect(res.status).toBe(403);
    expect(opened).toEqual([]);
  });

  it("missing path → 400", async () => {
    const res = await storageImage(imageReq(""));
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "Missing path" });
  });
});

describe("GET /api/gc-fitness/storage-image — allowed namespaces", () => {
  it.each(["habits/h1/photo.jpg", "exercises/e1/thumb.gif", "profile_photos/u9/avatar.jpg"])(
    "streams %s from the default bucket with its content type, private cache",
    async (object) => {
      put(BUCKET, object, "IMG-BYTES", "image/jpeg");
      const res = await storageImage(imagePath(object));
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toBe("image/jpeg");
      expect(res.headers.get("cache-control")).toBe("private, max-age=300");
      expect(Buffer.from(await res.arrayBuffer()).toString()).toBe("IMG-BYTES");
    },
  );

  it("gs:// URL on the project's own bucket is accepted", async () => {
    put(BUCKET, "habits/h1/photo.png", "PNG", "image/png");
    const res = await storageImage(imagePath(`gs://${BUCKET}/habits/h1/photo.png`));
    expect(res.status).toBe(200);
    expect(opened[0]).toBe(`${BUCKET}::habits/h1/photo.png`);
  });

  it("leading slashes on a bare path are stripped", async () => {
    put(BUCKET, "habits/h1/photo.jpg", "x", "image/jpeg");
    const res = await storageImage(imagePath("///habits/h1/photo.jpg"));
    expect(res.status).toBe(200);
  });

  it("falls back across bucket candidates (configured → .firebasestorage.app → .appspot.com)", async () => {
    process.env.NEXT_PUBLIC_GC_FITNESS_FIREBASE_STORAGE_BUCKET = "configured-bucket";
    put(LEGACY_BUCKET, "exercises/e1/a.gif", "GIF", "image/gif");
    const res = await storageImage(imagePath("exercises/e1/a.gif"));
    expect(res.status).toBe(200);
    expect(opened).toEqual([
      "configured-bucket::exercises/e1/a.gif",
      `${BUCKET}::exercises/e1/a.gif`,
      `${LEGACY_BUCKET}::exercises/e1/a.gif`,
    ]);
  });

  it("missing metadata contentType → application/octet-stream", async () => {
    put(BUCKET, "habits/h1/photo", "x");
    const res = await storageImage(imagePath("habits/h1/photo"));
    expect(res.headers.get("content-type")).toBe("application/octet-stream");
  });

  it("object found nowhere → 404", async () => {
    const res = await storageImage(imagePath("habits/nope.jpg"));
    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({ error: "Image not found" });
  });
});

describe("GET /api/gc-fitness/storage-image — a coach cannot read arbitrary objects", () => {
  it.each([
    ["progress photos", "progress_photos/client-1/p1.jpg"],
    ["chat media", "chat_media/chat-1/m1.jpg"],
    ["root object", "secrets.json"],
    ["prefix look-alike", "habitsX/evil.jpg"],
    ["prefix without slash", "habits"],
    ["case variant", "Habits/h1/photo.jpg"],
    ["traversal", "habits/../progress_photos/c1/p.jpg"],
    ["traversal at end", "exercises/.."],
    ["backslash traversal", "habits\\..\\progress_photos\\c1\\p.jpg"],
    ["gs:// traversal", `gs://${BUCKET}/habits/../progress_photos/c1/p.jpg`],
    ["gs:// other prefix", `gs://${BUCKET}/progress_photos/c1/p.jpg`],
    ["gs:// double slash", `gs://${BUCKET}//habits/h1.jpg`],
  ])("%s (%s) → 403, nothing opened", async (_label, path) => {
    put(BUCKET, path.replace(/^gs:\/\/[^/]+\//, ""), "SECRET", "image/jpeg");
    const res = await storageImage(imagePath(path));
    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({ error: "Forbidden path" });
    expect(opened).toEqual([]);
  });

  it("URL-encoded traversal (%2e%2e) is decoded once by URLSearchParams and still blocked", async () => {
    const res = await storageImage(imageReq("path=habits%2F%2e%2e%2Fprogress_photos%2Fc1%2Fp.jpg"));
    expect(res.status).toBe(403);
    expect(opened).toEqual([]);
  });

  it("double-encoded traversal (%252e%252e) stays a LITERAL object name under habits/ (no second decode)", async () => {
    put(BUCKET, "progress_photos/c1/p.jpg", "SECRET", "image/jpeg");
    const res = await storageImage(imageReq("path=habits%2F%252e%252e%2Fprogress_photos%2Fc1%2Fp.jpg"));
    // GCS object names are flat — the route opens the literal `%2e%2e` name,
    // which does not exist; the progress photo is never reached.
    expect(res.status).toBe(404);
    expect(opened.every((o) => o.endsWith("::habits/%2e%2e/progress_photos/c1/p.jpg"))).toBe(true);
  });

  it.each([
    ["gs:// with no object", "gs://some-bucket"],
    ["gs:// with empty bucket", "gs:///habits/h1.jpg"],
    ["gs:// with empty object", `gs://${BUCKET}/`],
  ])("%s → 400 Invalid path", async (_label, path) => {
    const res = await storageImage(imagePath(path));
    expect(res.status).toBe(400);
    expect(opened).toEqual([]);
  });

  // Was a SECURITY GAP: the gs:// bucket was tried FIRST with the Admin
  // service account, so a coach could read habits/ | exercises/ |
  // profile_photos/ objects from any bucket the SA can reach.
  it.each([
    "gs://other-project-backups/habits/dump.json",
    "gs://gcfitness-test-backups/exercises/x.gif",
    `gs://${BUCKET}.evil.com/habits/h1.jpg`,
    `gs://${BUCKET.toUpperCase()}/habits/h1.jpg`,
  ])("foreign bucket %s → 403, no object opened in ANY bucket", async (path) => {
    put("other-project-backups", "habits/dump.json", "FOREIGN-SECRET", "application/json");
    const res = await storageImage(imagePath(path));
    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({ error: "Forbidden path" });
    expect(opened).toEqual([]);
  });

  it.each([
    LEGACY_BUCKET,
    "gcfitness-3476b.firebasestorage.app", // habits/photo's fallback bucket
  ])("gs:// on the project's own bucket %s is accepted", async (bucket) => {
    put(bucket, "habits/h1/photo.jpg", "OWN", "image/jpeg");
    const res = await storageImage(imagePath(`gs://${bucket}/habits/h1/photo.jpg`));
    expect(res.status).toBe(200);
    expect(opened[0]).toBe(`${bucket}::habits/h1/photo.jpg`);
  });

  it("gs:// on the configured env bucket is accepted", async () => {
    process.env.NEXT_PUBLIC_GC_FITNESS_FIREBASE_STORAGE_BUCKET = "configured-bucket";
    put("configured-bucket", "exercises/e1/a.gif", "GIF", "image/gif");
    const res = await storageImage(imagePath("gs://configured-bucket/exercises/e1/a.gif"));
    expect(res.status).toBe(200);
  });

  // Was a SECURITY GAP: the stored metadata content type was echoed back, so
  // an SVG/HTML object under an allowed prefix ran script same-origin.
  it.each([
    ["image/svg+xml", "<svg onload=alert(1)>"],
    ["text/html", "<script>alert(1)</script>"],
    ["application/xhtml+xml", "<x/>"],
    ["IMAGE/SVG+XML; charset=utf-8", "<svg/>"],
  ])("stored %s is served as octet-stream, nosniff, sandboxed", async (type, body) => {
    put(BUCKET, "profile_photos/u9/avatar.jpg", body, type);
    const res = await storageImage(imagePath("profile_photos/u9/avatar.jpg"));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/octet-stream");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("content-security-policy")).toBe("default-src 'none'; sandbox");
  });

  it.each(["image/png", "image/webp", "image/gif", "Image/JPEG; q=1"])(
    "raster %s keeps its (normalized) type and still gets nosniff + sandbox",
    async (type) => {
      put(BUCKET, "exercises/e/a", "x", type);
      const res = await storageImage(imagePath("exercises/e/a"));
      expect(res.headers.get("content-type")).toBe(type.split(";")[0].toLowerCase());
      expect(res.headers.get("x-content-type-options")).toBe("nosniff");
      expect(res.headers.get("content-security-policy")).toBe("default-src 'none'; sandbox");
    },
  );
});

// ─────────────────────────────────────────────────────────────────────────────
describe("GET /api/gc-fitness/photo-proxy", () => {
  function proxyReq(photoId?: string): Request {
    const q = photoId === undefined ? "" : `?photoId=${encodeURIComponent(photoId)}`;
    return new Request(`https://backoffice.test/api/gc-fitness/photo-proxy${q}`);
  }

  beforeEach(() => {
    mockDb.current!
      .seed("users/client-1", { role: "client", coachId: "coach-a" })
      .seed("users/client-2", { role: "client", coachId: "coach-b" })
      .seed("progress_photos/p1", { clientId: "client-1", storagePath: "progress_photos/client-1/p1.jpg" })
      .seed("progress_photos/p2", { clientId: "client-2", storagePath: "progress_photos/client-2/p2.jpg" });
    put(BUCKET, "progress_photos/client-1/p1.jpg", "MINE", "image/jpeg");
    put(BUCKET, "progress_photos/client-2/p2.jpg", "THEIRS", "image/jpeg");
  });

  it("missing photoId → 400 (checked before auth)", async () => {
    mockGetTokens.mockResolvedValue(null);
    const res = await photoProxy(proxyReq());
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "Missing photoId" });
  });

  it("no session → 403, no Firestore read", async () => {
    mockGetTokens.mockResolvedValue(null);
    const res = await photoProxy(proxyReq("p1"));
    expect(res.status).toBe(403);
    expect(mockDb.current!.reads).toEqual([]);
    expect(opened).toEqual([]);
  });

  it("client token → 403", async () => {
    signIn(["client"], "client-1");
    const res = await photoProxy(proxyReq("p1"));
    expect(res.status).toBe(403);
    expect(opened).toEqual([]);
  });

  it("coach streams their own client's photo", async () => {
    const res = await photoProxy(proxyReq("p1"));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/jpeg");
    expect(res.headers.get("cache-control")).toBe("private, max-age=300");
    expect(Buffer.from(await res.arrayBuffer()).toString()).toBe("MINE");
    expect(opened).toEqual([`${BUCKET}::progress_photos/client-1/p1.jpg`]);
  });

  it("another coach's client's photo → 403, bytes never opened", async () => {
    const res = await photoProxy(proxyReq("p2"));
    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({ error: "Forbidden" });
    expect(opened).toEqual([]);
  });

  it("an ADMIN trainer gets no bypass for another coach's client", async () => {
    signIn(["trainer", "admin"]);
    const res = await photoProxy(proxyReq("p2"));
    expect(res.status).toBe(403);
    expect(opened).toEqual([]);
  });

  it("client doc missing → 403", async () => {
    mockDb.current!.seed("progress_photos/p3", { clientId: "ghost", storagePath: "progress_photos/ghost/p.jpg" });
    const res = await photoProxy(proxyReq("p3"));
    expect(res.status).toBe(403);
  });

  it("unknown photo → 404", async () => {
    const res = await photoProxy(proxyReq("nope"));
    expect(res.status).toBe(404);
  });

  it.each([
    ["no clientId", { storagePath: "progress_photos/client-1/x.jpg" }],
    ["no storagePath", { clientId: "client-1" }],
    ["empty storagePath", { clientId: "client-1", storagePath: "" }],
    ["numeric clientId", { clientId: 1, storagePath: "a" }],
  ])("malformed photo doc (%s) → 422", async (_label, data) => {
    mockDb.current!.seed("progress_photos/bad", data);
    const res = await photoProxy(proxyReq("bad"));
    expect(res.status).toBe(422);
    expect(opened).toEqual([]);
  });

  it("bytes missing in every bucket → 502", async () => {
    mockObjects.clear();
    const res = await photoProxy(proxyReq("p1"));
    expect(res.status).toBe(502);
    expect(opened).toHaveLength(2);
  });

  // Was a SECURITY GAP: same echo of the stored content type as storage-image.
  it("a progress photo stored as image/svg+xml is served as octet-stream, nosniff, sandboxed", async () => {
    put(BUCKET, "progress_photos/client-1/p1.jpg", "<svg onload=alert(1)>", "image/svg+xml");
    const res = await photoProxy(proxyReq("p1"));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/octet-stream");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("content-security-policy")).toBe("default-src 'none'; sandbox");
  });
});
