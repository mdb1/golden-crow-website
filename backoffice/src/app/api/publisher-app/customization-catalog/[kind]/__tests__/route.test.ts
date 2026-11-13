import { getServerSession } from "@/lib/session";
import { GET } from "../route";

jest.mock("@/lib/session", () => ({ getServerSession: jest.fn() }));
jest.mock("@/lib/publisher-app-customization-catalog-server", () => ({
  searchPublisherAppColorCatalog: jest.fn(() => ({
    catalogVersion: 1,
    items: [{ key: "brand.primary" }],
    groups: ["Brand"],
    totalCount: 1,
    nextCursor: null,
  })),
  searchPublisherAppTextCatalog: jest.fn(),
}));

describe("custom app customization catalog route", () => {
  beforeEach(() => jest.clearAllMocks());

  it("requires a signed-in backoffice session", async () => {
    jest.mocked(getServerSession).mockResolvedValue(null);
    const response = await GET(
      new Request(
        "https://example.test/api/publisher-app/customization-catalog/colors",
      ),
      { params: Promise.resolve({ kind: "colors" }) },
    );
    expect(response.status).toBe(401);
  });

  it("returns one private bounded page", async () => {
    jest.mocked(getServerSession).mockResolvedValue({
      user: { email: "admin@example.org" },
      expires: "2099-01-01T00:00:00.000Z",
    });
    const response = await GET(
      new Request(
        "https://example.test/api/publisher-app/customization-catalog/colors?limit=20",
      ),
      { params: Promise.resolve({ kind: "colors" }) },
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, max-age=300");
    expect(await response.json()).toMatchObject({
      catalogVersion: 1,
      items: [{ key: "brand.primary" }],
    });
  });
});
