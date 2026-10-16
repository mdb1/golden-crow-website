// storage-image-safety.test.ts — #451 regression net.
//
// These guards are the ONLY boundary in front of the Admin-SDK Storage proxies
// (the Admin SDK bypasses storage.rules). Two properties are security-relevant:
//
//   1. Only raster image types are ever served as themselves. A stored
//      `image/svg+xml` / `text/html` object streamed same-origin with its own
//      content type would execute script on the backoffice origin.
//   2. A caller-supplied `gs://<bucket>/…` can never point the service account
//      at a bucket outside this project.

import {
  DEFAULT_MEDIA_BUCKET,
  UPLOADABLE_IMAGE_TYPES,
  baseMediaType,
  isAllowedMediaBucket,
  projectMediaBuckets,
  safeImageHeaders,
} from "../storage-image-safety";

const ENV_KEYS = [
  "NEXT_PUBLIC_GC_FITNESS_FIREBASE_PROJECT_ID",
  "NEXT_PUBLIC_GC_FITNESS_FIREBASE_STORAGE_BUCKET",
] as const;
const savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const key of ENV_KEYS) {
    savedEnv[key] = process.env[key];
    delete process.env[key];
  }
});
afterEach(() => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
});

describe("baseMediaType", () => {
  it.each([
    ["image/png", "image/png"],
    ["Image/PNG; x=1", "image/png"],
    ["  image/jpeg ;charset=binary", "image/jpeg"],
    ["", ""],
    [null, ""],
    [undefined, ""],
  ])("%p → %p", (input, expected) => {
    expect(baseMediaType(input as string | null | undefined)).toBe(expected);
  });
});

describe("safeImageHeaders — never lets a document type through", () => {
  it.each([
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
    "image/heic",
    "image/heif",
    "image/avif",
  ])("serves raster %s as itself", (type) => {
    expect(safeImageHeaders(type)["Content-Type"]).toBe(type);
  });

  it("normalizes case and parameters on a raster type", () => {
    expect(safeImageHeaders("IMAGE/WEBP; q=0.9")["Content-Type"]).toBe("image/webp");
  });

  it.each([
    "image/svg+xml",
    "IMAGE/SVG+XML",
    "image/svg+xml; charset=utf-8",
    "text/html",
    "text/html; charset=utf-8",
    "application/xhtml+xml",
    "application/xml",
    "text/xml",
    "application/javascript",
    "text/javascript",
    "application/pdf",
    "text/plain",
    "multipart/x-mixed-replace",
    // A comma is not a parameter separator — this is NOT image/png.
    "image/png, text/html",
    "image/png\ntext/html",
    "image/",
    "image/*",
    "",
  ])("forces %p to application/octet-stream", (type) => {
    expect(safeImageHeaders(type)["Content-Type"]).toBe("application/octet-stream");
  });

  it.each([null, undefined, 42, {}, ["image/png"], true])(
    "a non-string stored type (%p) is octet-stream",
    (value) => {
      expect(safeImageHeaders(value)["Content-Type"]).toBe("application/octet-stream");
    },
  );

  it("always carries nosniff + a sandboxing CSP + private cache, for every type", () => {
    for (const type of ["image/png", "image/svg+xml", "text/html", undefined]) {
      const headers = safeImageHeaders(type);
      expect(headers["X-Content-Type-Options"]).toBe("nosniff");
      expect(headers["Content-Security-Policy"]).toBe("default-src 'none'; sandbox");
      expect(headers["Cache-Control"]).toBe("private, max-age=300");
    }
  });
});

describe("UPLOADABLE_IMAGE_TYPES", () => {
  it("accepts only jpeg/png/webp", () => {
    expect([...UPLOADABLE_IMAGE_TYPES].sort()).toEqual([
      "image/jpeg",
      "image/png",
      "image/webp",
    ]);
  });

  it.each(["image/svg+xml", "image/gif", "text/html", "application/octet-stream"])(
    "rejects %s",
    (type) => {
      expect(UPLOADABLE_IMAGE_TYPES.has(type)).toBe(false);
    },
  );
});

describe("projectMediaBuckets", () => {
  it("is empty with no env", () => {
    expect(projectMediaBuckets()).toEqual([]);
  });

  it("lists the explicit bucket first, then both default bucket names for the project", () => {
    process.env.NEXT_PUBLIC_GC_FITNESS_FIREBASE_STORAGE_BUCKET = "custom-bucket";
    process.env.NEXT_PUBLIC_GC_FITNESS_FIREBASE_PROJECT_ID = "proj-1";
    expect(projectMediaBuckets()).toEqual([
      "custom-bucket",
      "proj-1.firebasestorage.app",
      "proj-1.appspot.com",
    ]);
  });

  it("drops an empty-string env bucket instead of allowing ''", () => {
    process.env.NEXT_PUBLIC_GC_FITNESS_FIREBASE_STORAGE_BUCKET = "";
    process.env.NEXT_PUBLIC_GC_FITNESS_FIREBASE_PROJECT_ID = "";
    expect(projectMediaBuckets()).toEqual([]);
  });
});

describe("isAllowedMediaBucket — rejects every bucket outside the project", () => {
  it("allows the default bucket with no env configured", () => {
    expect(isAllowedMediaBucket(DEFAULT_MEDIA_BUCKET)).toBe(true);
    expect(DEFAULT_MEDIA_BUCKET).toBe("gcfitness-3476b.firebasestorage.app");
  });

  it("allows the configured project's buckets", () => {
    process.env.NEXT_PUBLIC_GC_FITNESS_FIREBASE_PROJECT_ID = "proj-1";
    process.env.NEXT_PUBLIC_GC_FITNESS_FIREBASE_STORAGE_BUCKET = "custom-bucket";
    expect(isAllowedMediaBucket("custom-bucket")).toBe(true);
    expect(isAllowedMediaBucket("proj-1.firebasestorage.app")).toBe(true);
    expect(isAllowedMediaBucket("proj-1.appspot.com")).toBe(true);
  });

  it.each([
    "",
    "evil-bucket",
    "goldencrow-pocketgenes.appspot.com",
    "goldencrow-pocketgenes.firebasestorage.app",
    "gcfitness-3476b.firebasestorage.app.evil.com",
    "evil.gcfitness-3476b.firebasestorage.app",
    " gcfitness-3476b.firebasestorage.app",
    "gcfitness-3476b.firebasestorage.app/",
    "GCFITNESS-3476B.FIREBASESTORAGE.APP",
    "gcfitness-3476b.appspot.com", // not allowed until the project id env says so
  ])("rejects %p", (bucket) => {
    expect(isAllowedMediaBucket(bucket)).toBe(false);
  });

  it("does not allow a different project's buckets by prefix/suffix tricks", () => {
    process.env.NEXT_PUBLIC_GC_FITNESS_FIREBASE_PROJECT_ID = "proj-1";
    expect(isAllowedMediaBucket("proj-10.appspot.com")).toBe(false);
    expect(isAllowedMediaBucket("xproj-1.appspot.com")).toBe(false);
    expect(isAllowedMediaBucket("proj-1.appspot.com.evil")).toBe(false);
  });
});
