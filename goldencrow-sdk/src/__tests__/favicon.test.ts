import { Buffer } from "node:buffer";

const mockLookup = jest.fn();

jest.mock("node:dns/promises", () => ({
  lookup: (...args: unknown[]) => mockLookup(...args),
}));

describe("favicon extraction", () => {
  beforeEach(() => {
    mockLookup.mockReset();
    mockLookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
    global.fetch = jest.fn();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("extracts the highest scoring favicon as an upload data URL", async () => {
    const { extractFavicon } = await import("../lib/favicon.js");
    const svg = Buffer.from("<svg xmlns=\"http://www.w3.org/2000/svg\"></svg>");
    jest.mocked(fetch)
      .mockResolvedValueOnce(
        new Response(
          '<html><head><link rel="icon" sizes="32x32" href="/small.png"><link rel="icon" sizes="any" type="image/svg+xml" href="/brand.svg"></head></html>',
          {
            status: 200,
            headers: { "content-type": "text/html" },
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(svg, {
          status: 200,
          headers: {
            "content-type": "image/svg+xml",
            "content-length": String(svg.length),
          },
        }),
      );

    const result = await extractFavicon("example.org");

    expect(result.pageUrl).toBe("https://example.org/");
    expect(result.faviconUrl).toBe("https://example.org/brand.svg");
    expect(result.contentType).toBe("image/svg+xml");
    expect(result.fileName).toBe("brand.svg");
    expect(result.dataUrl).toBe(`data:image/svg+xml;base64,${svg.toString("base64")}`);
  });

  it("blocks redirects to private network destinations", async () => {
    const { extractFavicon } = await import("../lib/favicon.js");
    jest.mocked(fetch).mockResolvedValueOnce(
      new Response(null, {
        status: 302,
        headers: { location: "http://127.0.0.1/favicon.ico" },
      }),
    );

    await expect(extractFavicon("example.org")).rejects.toThrow(
      "URL destination is not allowed.",
    );
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("blocks non-standard web ports", async () => {
    const { extractFavicon } = await import("../lib/favicon.js");

    await expect(extractFavicon("https://example.org:8080")).rejects.toThrow(
      "URL destination is not allowed.",
    );
    expect(fetch).not.toHaveBeenCalled();
  });
});
