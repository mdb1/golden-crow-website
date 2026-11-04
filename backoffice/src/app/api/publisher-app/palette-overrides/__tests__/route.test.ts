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

  it("returns a private plan with exactly 167 coordinated roles", async () => {
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
      catalogVersion: 2,
      sourceCount: 334,
      selectedCount: 167,
    });
    expect(Object.keys(body.colorOverrides)).toHaveLength(167);
  });
});
