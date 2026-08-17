// wiki-loom-posters.test.ts
//
// Pins the thing that has now broken the Coach Wiki twice: WHERE a video's
// poster frame comes from.
//
// The first facade GUESSED the URL from the share id
// (`…/thumbnails/{loomId}-with-play.jpg`). That guess is not the real path —
// Loom's carries an opaque hash — and when it started 403-ing, every faced card
// went black and the facade was reverted. Its replacement (a live iframe per
// card) then produced the black players this suite's sibling test covers.
//
// So the rule these tests exist to keep: the poster URL is READ from Loom's
// oEmbed response, never constructed, and a video whose poster cannot be read
// resolves to "no poster" — which the player renders as a labelled placeholder —
// rather than to a guessed URL or a thrown page.

import { fetchLoomPosters } from "../wiki-loom-posters";

const OEMBED_GIF =
  "https://cdn.loom.com/sessions/thumbnails/abc123-e76e15dfcf873cd3.gif";

function oembedResponse(body: unknown, ok = true) {
  return {
    ok,
    json: async () => body,
  } as unknown as Response;
}

describe("fetchLoomPosters", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  /// The happy path, and the two transformations that matter.
  ///
  /// The `.jpg` swap is not cosmetic: `thumbnail_url` points at an ANIMATED gif
  /// (~320-550 KB measured across our videos), and the same hashed path as
  /// `.jpg` is a static frame at ~60 KB. Fifteen cards makes that the difference
  /// between ~6 MB of looping gifs and under a megabyte of posters.
  it("reads the poster from oEmbed and prefers the static frame", async () => {
    global.fetch = jest.fn(async () =>
      oembedResponse({ thumbnail_url: OEMBED_GIF, duration: 70.946 }),
    ) as unknown as typeof fetch;

    const posters = await fetchLoomPosters(["abc123"]);

    expect(posters.get("abc123")).toEqual({
      posterUrl:
        "https://cdn.loom.com/sessions/thumbnails/abc123-e76e15dfcf873cd3.jpg",
      durationSeconds: 70.946,
    });
  });

  /// The hash is the whole point. A poster URL built from the share id alone is
  /// the bug that shipped twice — if this ever passes with a constructed URL,
  /// the guess is back.
  it("keeps Loom's opaque hash instead of deriving a URL from the id", async () => {
    global.fetch = jest.fn(async () =>
      oembedResponse({ thumbnail_url: OEMBED_GIF }),
    ) as unknown as typeof fetch;

    const posterUrl = (await fetchLoomPosters(["abc123"])).get("abc123")
      ?.posterUrl;

    expect(posterUrl).toContain("-e76e15dfcf873cd3");
    expect(posterUrl).not.toContain("-with-play");
  });

  /// A payload we do not recognise degrades to "slightly heavier poster", not to
  /// a URL that 404s. Passing an unexpected extension through untouched is what
  /// makes a future change on Loom's side survivable.
  it("passes a non-gif thumbnail through untouched", async () => {
    global.fetch = jest.fn(async () =>
      oembedResponse({
        thumbnail_url: "https://cdn.loom.com/sessions/thumbnails/abc123-ff.webp",
      }),
    ) as unknown as typeof fetch;

    expect((await fetchLoomPosters(["abc123"])).get("abc123")?.posterUrl).toBe(
      "https://cdn.loom.com/sessions/thumbnails/abc123-ff.webp",
    );
  });

  /// One rate-limited video must not cost the page its other posters. This is
  /// why the implementation uses `allSettled` — with `all`, a single 429 while
  /// fifteen requests go out would blank the whole grid.
  it("keeps the other posters when one video fails", async () => {
    global.fetch = jest.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes("bad")) throw new Error("429 Too Many Requests");
      return oembedResponse({ thumbnail_url: OEMBED_GIF });
    }) as unknown as typeof fetch;

    const posters = await fetchLoomPosters(["good", "bad"]);

    expect(posters.has("good")).toBe(true);
    expect(posters.has("bad")).toBe(false);
  });

  /// Loom being down is a degraded page, never a broken one. The Wiki is public
  /// and unauthenticated — a throw here would 500 the page a coach was sent.
  it("resolves to no poster rather than throwing when oEmbed is unavailable", async () => {
    global.fetch = jest.fn(async () =>
      oembedResponse({ error: "nope" }, false),
    ) as unknown as typeof fetch;

    await expect(fetchLoomPosters(["abc123"])).resolves.toEqual(new Map());
  });

  /// A 200 whose body is not what we expect is the same as a failure: no
  /// poster. What it must not do is produce `undefined` inside a URL string.
  it("ignores a malformed payload", async () => {
    global.fetch = jest.fn(async () =>
      oembedResponse({ thumbnail_url: 42 }),
    ) as unknown as typeof fetch;

    expect((await fetchLoomPosters(["abc123"])).size).toBe(0);
  });

  /// The page passes every id on the route; asking Loom twice for a video used
  /// in two places is wasted budget against an endpoint we already rate-limit
  /// ourselves against with a 24 h revalidate.
  it("asks Loom once per distinct video", async () => {
    const fetchMock = jest.fn(async () =>
      oembedResponse({ thumbnail_url: OEMBED_GIF }),
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    await fetchLoomPosters(["abc123", "abc123", "def456"]);

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
