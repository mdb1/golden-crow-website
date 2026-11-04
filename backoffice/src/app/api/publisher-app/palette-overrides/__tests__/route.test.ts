import { getServerSession } from "next-auth";
import { POST } from "../route";

jest.mock("next-auth", () => ({ getServerSession: jest.fn() }));
jest.mock("@/lib/auth", () => ({ authOptions: { marker: "auth" } }));

describe("custom app palette override route", () => {
  beforeEach(() => jest.clearAllMocks());

  it("requires a signed-in backoffice session", async () => {
    jest.mocked(getServerSession).mockResolvedValue(null);
    const response = await POST(
      new Request("https://example.test/api/publisher-app/palette-overrides", {
        method: "POST",
        body: JSON.stringify({
          colors: {
            primary: "#FF5500",
            secondary: "#FFB21F",
            tertiary: "#F58220",
          },
        }),
      }),
    );

    expect(response.status).toBe(401);
  });

  it("rejects incomplete or malformed palettes", async () => {
    jest.mocked(getServerSession).mockResolvedValue({
      user: { email: "admin@example.org" },
      expires: "2099-01-01T00:00:00.000Z",
    });
    const response = await POST(
      new Request("https://example.test/api/publisher-app/palette-overrides", {
        method: "POST",
        body: JSON.stringify({
          colors: {
            primary: "orange",
            secondary: "#FFB21F",
            tertiary: "#F58220",
          },
        }),
      }),
    );

    expect(response.status).toBe(400);
  });

  it("returns a private plan containing only branding-susceptible colors", async () => {
    jest.mocked(getServerSession).mockResolvedValue({
      user: { email: "admin@example.org" },
      expires: "2099-01-01T00:00:00.000Z",
    });
    const response = await POST(
      new Request("https://example.test/api/publisher-app/palette-overrides", {
        method: "POST",
        body: JSON.stringify({
          colors: {
            primary: "#FF5500",
            secondary: "#FFB21F",
            tertiary: "#F58220",
          },
        }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(body).toMatchObject({
      catalogVersion: 5,
      sourceCount: 620,
    });
    expect(body.selectedCount).toBe(Object.keys(body.colorOverrides).length);
    expect(body.selectedCount).toBeGreaterThan(0);
    expect(body.selectedCount).toBeLessThan(body.sourceCount);
    expect(body.colorOverrides).toEqual(
      expect.objectContaining({
        "learn.level.bacteria.accent": expect.any(Object),
        "discover.suggestion.pocketGuideInitialOverview.accent":
          expect.any(Object),
        "discover.requestLauncher.ribbonStart": expect.any(Object),
        "discover.variantFinder.metricVariants": expect.any(Object),
        "community.newPost.headerAccent": expect.any(Object),
        "community.genes.primary": expect.any(Object),
        "savedContent.headerStart": expect.any(Object),
      }),
    );
  });
});
