import proxy, { config } from "../../proxy";
import { withAuth } from "next-auth/middleware";

jest.mock("next-auth/middleware", () => ({
  withAuth: jest.fn(() => jest.fn(() => new Response("next-auth"))),
}));

jest.mock("next-firebase-auth-edge", () => ({
  authMiddleware: jest.fn(() => new Response("gc-fitness-auth")),
}));

function matcherIncludes(pathname: string) {
  return config.matcher.some((matcher) => {
    if (matcher.endsWith("/:path*")) {
      const prefix = matcher.slice(0, -"/:path*".length);
      return pathname === prefix || pathname.startsWith(`${prefix}/`);
    }

    return new RegExp(`^${matcher}$`).test(pathname);
  });
}

describe("proxy OpenAPI public routes", () => {
  it("keeps public OpenAPI paths outside the browser-session matcher", () => {
    expect(matcherIncludes("/open-api/oauth/token")).toBe(false);
    expect(matcherIncludes("/open-api/reporting/patients")).toBe(false);
    expect(matcherIncludes("/api/sdk/auth/login")).toBe(false);

    expect(matcherIncludes("/api/open-api/reporting/integration-clients")).toBe(
      true,
    );
    expect(matcherIncludes("/2pq-dashboard/api-keys")).toBe(true);
  });

  it("bypasses NextAuth if a public OpenAPI request reaches proxy directly", async () => {
    const nextAuthHandler = (withAuth as jest.Mock).mock.results[0]
      ?.value as jest.Mock;
    nextAuthHandler.mockClear();

    await proxy({
      nextUrl: {
        pathname: "/open-api/oauth/token",
      },
      url: "https://golden-crow-backoffice.vercel.app/open-api/oauth/token",
    } as never);

    expect(nextAuthHandler).not.toHaveBeenCalled();
  });
});
