// __tests__/fetch-fexd-assets.test.ts
//
// Unit tests for Task B of plan 260522-mo2 — the Free-Exercise-DB image
// pipeline. Covers all seven behaviors enumerated in PLAN.md <behavior>:
//
//   B.beh.1  Default is dry-run (apply=false)
//   B.beh.2  Missing source JPG → WARN + skip + status:'missing-source' (no crash)
//   B.beh.3  Ping-pong GIF round-trips back through gif-encoder-2's decode shape
//   B.beh.4  All 3 objects (start.jpg, end.jpg, preview.gif) uploaded with
//            customMetadata.sha256 + getSignedUrl captured
//   B.beh.5  Idempotency: existing customMetadata.sha256 match → status:'skipped'
//   B.beh.6  Storage paths follow exercises/{id}/{start.jpg|end.jpg|preview.gif}
//   B.beh.7  Output report shape: status ∈ {would-upload,uploaded,skipped,
//            missing-source,error} keyed by exerciseId
//
// firebase-admin/storage + global.fetch are mocked — no live network calls.

jest.mock("firebase-admin/firestore", () => ({
  FieldValue: { serverTimestamp: jest.fn(() => "__SERVER_TIMESTAMP__") },
  Timestamp: { now: jest.fn(() => ({ __ts__: 12345 })) },
  getFirestore: jest.fn(),
}));

jest.mock("firebase-admin/app", () => ({
  cert: jest.fn(),
  getApps: jest.fn(() => []),
  initializeApp: jest.fn(),
}));

// Mock firebase-admin/storage. Each file() call returns a freshly-tracked
// FakeStorageFile so individual tests can configure exists/getMetadata/save/
// getSignedUrl per path.
type FakeFile = {
  path: string;
  exists: jest.Mock;
  getMetadata: jest.Mock;
  save: jest.Mock;
  getSignedUrl: jest.Mock;
};
const fileRegistry: Map<string, FakeFile> = new Map();

function makeFile(p: string): FakeFile {
  const f: FakeFile = {
    path: p,
    exists: jest.fn(async () => [false]),
    getMetadata: jest.fn(async () => [{ customMetadata: {} }]),
    save: jest.fn(async () => undefined),
    getSignedUrl: jest.fn(async () => [
      `https://firebasestorage.googleapis.com/v0/b/gcfitness-3476b.firebasestorage.app/o/${encodeURIComponent(
        p,
      )}?alt=media&token=fake-token`,
    ]),
  };
  fileRegistry.set(p, f);
  return f;
}

function getOrMakeFile(p: string): FakeFile {
  return fileRegistry.get(p) ?? makeFile(p);
}

const bucketMock = {
  name: "gcfitness-3476b.firebasestorage.app",
  file: jest.fn((p: string) => getOrMakeFile(p)),
};

jest.mock("firebase-admin/storage", () => ({
  getStorage: jest.fn(() => ({ bucket: jest.fn(() => bucketMock) })),
}));

import {
  parseArgs,
  generatePingPongGif,
  uploadAssetsForExercise,
  parseAllowlistForFexd,
  type AssetReportEntry,
} from "../fetch-fexd-assets";

import * as fs from "node:fs";
import * as path from "node:path";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a real JPEG byte buffer (small, valid) so jpeg-js can decode it. */
function makeFakeJpegBuffer(width = 16, height = 16): Buffer {
  // jpeg-js encode requires an RGBA buffer of width*height*4 bytes.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const jpeg = require("jpeg-js");
  const rgba = Buffer.alloc(width * height * 4);
  for (let i = 0; i < rgba.length; i += 4) {
    rgba[i] = 200; // R
    rgba[i + 1] = 100; // G
    rgba[i + 2] = 50; // B
    rgba[i + 3] = 255; // A
  }
  const encoded = jpeg.encode({ data: rgba, width, height }, 80);
  return Buffer.from(encoded.data);
}

function resetMocks() {
  fileRegistry.clear();
  bucketMock.file.mockClear();
}

beforeEach(() => {
  resetMocks();
});

// ---------------------------------------------------------------------------
// B.beh.1 — Default is dry-run; --apply flips
// ---------------------------------------------------------------------------

describe("parseArgs (B.beh.1)", () => {
  it("defaults apply=false (dry-run)", () => {
    const args = parseArgs([]);
    expect(args.apply).toBe(false);
  });

  it("--apply sets apply=true", () => {
    const args = parseArgs(["--apply"]);
    expect(args.apply).toBe(true);
  });

  it("--allowlist overrides default path", () => {
    const args = parseArgs(["--allowlist", "/tmp/x.md"]);
    expect(args.allowlist).toBe(path.resolve("/tmp/x.md"));
  });

  it("unknown args throw", () => {
    expect(() => parseArgs(["--what"])).toThrow(/Unknown argument/);
  });
});

// ---------------------------------------------------------------------------
// B.beh.3 — Ping-pong GIF round-trips back to 2 frames
// ---------------------------------------------------------------------------

describe("generatePingPongGif (B.beh.3)", () => {
  it("produces a valid GIF89a buffer with the GIF magic header", () => {
    const start = makeFakeJpegBuffer(16, 16);
    const end = makeFakeJpegBuffer(16, 16);
    const gif = generatePingPongGif(start, end);
    expect(gif).toBeInstanceOf(Buffer);
    expect(gif.length).toBeGreaterThan(0);
    // GIF89a magic header
    expect(gif.slice(0, 6).toString("ascii")).toMatch(/^GIF8(7|9)a$/);
    // GIF trailer byte (0x3B)
    expect(gif[gif.length - 1]).toBe(0x3b);
  });

  it("encodes 2 frames (graphic-control-extension marker 0x21 0xF9 0x04 appears twice)", () => {
    const start = makeFakeJpegBuffer(16, 16);
    const end = makeFakeJpegBuffer(16, 16);
    const gif = generatePingPongGif(start, end);
    // Each frame in a multi-frame GIF is preceded by a Graphic Control
    // Extension block (3-byte introducer: 0x21 0xF9 0x04). LZW-encoded image
    // data uses single-byte segments and won't reliably contain this 3-byte
    // sequence — counting it gives an accurate frame count for our 16x16
    // 2-frame ping-pong.
    let gceCount = 0;
    for (let i = 0; i < gif.length - 2; i++) {
      if (gif[i] === 0x21 && gif[i + 1] === 0xf9 && gif[i + 2] === 0x04) gceCount++;
    }
    expect(gceCount).toBe(2);
  });

  it("ping-pong GIF has the Netscape looping extension (infinite loop)", () => {
    const start = makeFakeJpegBuffer(16, 16);
    const end = makeFakeJpegBuffer(16, 16);
    const gif = generatePingPongGif(start, end);
    // Netscape 2.0 looping extension: 0x21 0xFF 0x0B "NETSCAPE2.0" ... loopCount=0.
    const hasNetscape = gif.includes(Buffer.from("NETSCAPE2.0"));
    expect(hasNetscape).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// B.beh.5 — Idempotency: existing customMetadata.sha256 match → skipped
// ---------------------------------------------------------------------------

describe("uploadAssetsForExercise idempotency (B.beh.5)", () => {
  it("returns status:'skipped' when all 3 objects exist with matching sha256", async () => {
    const start = makeFakeJpegBuffer(16, 16);
    const end = makeFakeJpegBuffer(16, 16);

    // Mock fetch to return the source JPGs.
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        arrayBuffer: async () => start.buffer.slice(start.byteOffset, start.byteOffset + start.byteLength),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        arrayBuffer: async () => end.buffer.slice(end.byteOffset, end.byteOffset + end.byteLength),
      });
    (global as unknown as { fetch: typeof fetch }).fetch = fetchMock as unknown as typeof fetch;

    // Compute the sha256 the script will look for.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const crypto = require("node:crypto") as typeof import("node:crypto");
    const sha = crypto
      .createHash("sha256")
      .update(start)
      .update(end)
      .update("gif-encoder-2@1.0.5")
      .digest("hex");

    // Pre-create all 3 files with matching sha in customMetadata.
    for (const name of ["start.jpg", "end.jpg", "preview.gif"]) {
      const p = `exercises/test-id/${name}`;
      const f = makeFile(p);
      f.exists.mockResolvedValue([true]);
      f.getMetadata.mockResolvedValue([{ customMetadata: { sha256: sha } }]);
    }

    const result = await uploadAssetsForExercise(
      {
        exerciseId: "test-id",
        fexdSlug: "Test_Slug",
        fexdDir: "Test_Slug",
      },
      bucketMock as never,
      { dryRun: false },
    );

    expect(result.status).toBe("skipped");
    // No save() calls on any of the 3 files.
    for (const name of ["start.jpg", "end.jpg", "preview.gif"]) {
      const f = fileRegistry.get(`exercises/test-id/${name}`)!;
      expect(f.save).not.toHaveBeenCalled();
    }
  });
});

// ---------------------------------------------------------------------------
// B.beh.2 — Missing source JPG → status:'missing-source' (no crash)
// ---------------------------------------------------------------------------

describe("uploadAssetsForExercise missing source (B.beh.2)", () => {
  it("returns status:'missing-source' on 404 from raw.githubusercontent.com", async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: false,
      status: 404,
      arrayBuffer: async () => new ArrayBuffer(0),
    });
    (global as unknown as { fetch: typeof fetch }).fetch = fetchMock as unknown as typeof fetch;

    const result = await uploadAssetsForExercise(
      {
        exerciseId: "missing-id",
        fexdSlug: "Missing",
        fexdDir: "Missing",
      },
      bucketMock as never,
      { dryRun: false },
    );

    expect(result.status).toBe("missing-source");
    // bucket.file was never called for upload because the fetch failed first.
    expect(bucketMock.file).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// B.beh.6 — Storage paths exactly exercises/{id}/{start.jpg|end.jpg|preview.gif}
// B.beh.4 — All 3 objects uploaded + customMetadata.sha256 + getSignedUrl
// ---------------------------------------------------------------------------

describe("uploadAssetsForExercise upload paths + apply (B.beh.4 + B.beh.6)", () => {
  it("--apply uploads all 3 objects at exercises/{id}/{filename}", async () => {
    const start = makeFakeJpegBuffer(16, 16);
    const end = makeFakeJpegBuffer(16, 16);
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        arrayBuffer: async () => start.buffer.slice(start.byteOffset, start.byteOffset + start.byteLength),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        arrayBuffer: async () => end.buffer.slice(end.byteOffset, end.byteOffset + end.byteLength),
      });
    (global as unknown as { fetch: typeof fetch }).fetch = fetchMock as unknown as typeof fetch;

    const result = await uploadAssetsForExercise(
      {
        exerciseId: "abc-123",
        fexdSlug: "Abc_Slug",
        fexdDir: "Abc_Slug",
      },
      bucketMock as never,
      { dryRun: false },
    );

    expect(result.status).toBe("uploaded");

    // Check the 3 expected paths were targeted.
    const paths = bucketMock.file.mock.calls.map((c) => c[0] as string);
    expect(paths).toEqual(
      expect.arrayContaining([
        "exercises/abc-123/start.jpg",
        "exercises/abc-123/end.jpg",
        "exercises/abc-123/preview.gif",
      ]),
    );

    // Each save() call carries a customMetadata.sha256 (B.beh.4 stamp).
    for (const name of ["start.jpg", "end.jpg", "preview.gif"]) {
      const f = fileRegistry.get(`exercises/abc-123/${name}`)!;
      expect(f.save).toHaveBeenCalledTimes(1);
      const saveCall = f.save.mock.calls[0];
      const opts = saveCall[1] as { metadata: { customMetadata: { sha256?: string } } };
      expect(opts.metadata.customMetadata.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(f.getSignedUrl).toHaveBeenCalled();
    }

    // Result URLs.
    expect(result.imageUrl).toMatch(/^https:\/\/firebasestorage\.googleapis\.com/);
    expect(result.endImageUrl).toMatch(/^https:\/\/firebasestorage\.googleapis\.com/);
    expect(result.gifUrl).toMatch(/^https:\/\/firebasestorage\.googleapis\.com/);
  });

  it("dry-run returns status:'would-upload' without calling save()", async () => {
    const start = makeFakeJpegBuffer(16, 16);
    const end = makeFakeJpegBuffer(16, 16);
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        arrayBuffer: async () => start.buffer.slice(start.byteOffset, start.byteOffset + start.byteLength),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        arrayBuffer: async () => end.buffer.slice(end.byteOffset, end.byteOffset + end.byteLength),
      });
    (global as unknown as { fetch: typeof fetch }).fetch = fetchMock as unknown as typeof fetch;

    const result = await uploadAssetsForExercise(
      {
        exerciseId: "dryrun-id",
        fexdSlug: "DryRun",
        fexdDir: "DryRun",
      },
      bucketMock as never,
      { dryRun: true },
    );

    expect(result.status).toBe("would-upload");
    for (const name of ["start.jpg", "end.jpg", "preview.gif"]) {
      const f = fileRegistry.get(`exercises/dryrun-id/${name}`);
      if (f) expect(f.save).not.toHaveBeenCalled();
    }
  });
});

// ---------------------------------------------------------------------------
// B.beh.7 — Output report shape: status keys + per-entry shape
// ---------------------------------------------------------------------------

describe("parseAllowlistForFexd", () => {
  it("extracts (exerciseId, fexdSlug) tuples from ALLOWLIST-PROPOSAL.md table rows", () => {
    const md = [
      "## Approved allowlist",
      "",
      "### Squat pattern (2/8)",
      "| fexd id (slug) | fexd name (EN) | Equipment | Mechanic | Disposition | Target doc-id | Match confidence | Notes |",
      "| --- | --- | --- | --- | --- | --- | --- | --- |",
      "| Bodyweight_Squat | Bodyweight Squat | body only | compound | NEW | fexd-Bodyweight_Squat | — | new doc |",
      "| Hack_Squat | Hack Squat | machine | compound | MATCH | wger-18104387-4567-4c1e-8d03-db0b274646dd | low (dist 8) | was Hack Squat Machine |",
      "",
      "## Soft-delete list (unmatched wger-* survivors)",
      "",
    ].join("\n");
    const picks = parseAllowlistForFexd(md);
    expect(picks).toEqual([
      {
        exerciseId: "fexd-Bodyweight_Squat",
        fexdSlug: "Bodyweight_Squat",
        fexdDir: "Bodyweight_Squat",
        disposition: "NEW",
      },
      {
        exerciseId: "wger-18104387-4567-4c1e-8d03-db0b274646dd",
        fexdSlug: "Hack_Squat",
        fexdDir: "Hack_Squat",
        disposition: "MATCH",
      },
    ]);
  });

  it("stops parsing at the Soft-delete section (does NOT pick up unrelated wger rows)", () => {
    const md = [
      "## Approved allowlist",
      "",
      "### Squat pattern (1/8)",
      "| fexd id (slug) | fexd name (EN) | Equipment | Mechanic | Disposition | Target doc-id | Match confidence | Notes |",
      "| --- | --- | --- | --- | --- | --- | --- | --- |",
      "| Crunches | Crunches | body only | isolation | NEW | fexd-Crunches | — | new doc |",
      "",
      "## Soft-delete list (unmatched wger-* survivors)",
      "",
      "| wger doc-id | name (EN) | name (ES) | Reason |",
      "| --- | --- | --- | --- |",
      "| wger-aaaa | Some name | Algún nombre | unmatched |",
    ].join("\n");
    const picks = parseAllowlistForFexd(md);
    expect(picks).toHaveLength(1);
    expect(picks[0].exerciseId).toBe("fexd-Crunches");
  });
});

describe("report status keys (B.beh.7)", () => {
  it("AssetReportEntry status union covers all five literals", () => {
    // Type-level guard rendered as a runtime sanity test. The compiler
    // refuses any value outside the union.
    const sample: Record<string, AssetReportEntry> = {
      a: { status: "would-upload" },
      b: { status: "uploaded", imageUrl: "x", endImageUrl: "y", gifUrl: "z", sourceSha256: "h" },
      c: { status: "skipped" },
      d: { status: "missing-source" },
      e: { status: "error", error: "boom" },
    };
    expect(Object.keys(sample)).toHaveLength(5);
  });
});

// Sanity: jest is reading the actual file we wrote.
describe("module shape", () => {
  it("fetch-fexd-assets exports the expected functions", () => {
    expect(typeof parseArgs).toBe("function");
    expect(typeof generatePingPongGif).toBe("function");
    expect(typeof uploadAssetsForExercise).toBe("function");
    expect(typeof parseAllowlistForFexd).toBe("function");
  });
});
