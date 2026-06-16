import { NextResponse, type NextRequest } from "next/server";
import { withAuth } from "next-auth/middleware";
import { authMiddleware } from "next-firebase-auth-edge";

// Next.js 16 `proxy.ts` file convention (renamed from src/middleware.ts in 02-03).
// This file routes incoming requests to one of two auth stacks:
//
//   1. /gc-fitness/* and /api/gc-fitness/{login,logout}  →  next-firebase-auth-edge
//      (cookie-based SSR auth for the gc-fitness trainer surface; access is
//      based on a valid trainer session cookie minted by the GC Fitness login
//      flow. Public login/forbidden pages bypass the gate.)
//   2. Everything else                                    →  NextAuth `withAuth`
//      (existing MyDNAMap / Pocket Gyms behavior preserved unchanged)
//
// Public gc-fitness pages (login, forbidden) bypass the auth check so users can
// reach the sign-in CTA and the 403 page without a valid session. The login +
// logout API routes are listed in the matcher BUT short-circuited to next() so
// the next-firebase-auth-edge cookie-mint flow can run without the middleware
// re-checking the (not-yet-set) cookie.

const GC_FITNESS_PUBLIC_PATHS = new Set([
  "/gc-fitness/login",
  "/gc-fitness/forbidden",
]);

const GC_FITNESS_API_PATHS = new Set([
  "/api/gc-fitness/login",
  "/api/gc-fitness/logout",
]);

// NextAuth handler — reused for non-gc-fitness paths. Lazy-cached so we
// don't pay the construction cost when only gc-fitness paths are hit.
const nextAuthHandler = withAuth({
  pages: {
    signIn: "/login",
    error: "/access-denied",
  },
});

export default async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // ── gc-fitness branch ────────────────────────────────────────────────
  if (
    pathname.startsWith("/gc-fitness") ||
    pathname.startsWith("/api/gc-fitness")
  ) {
    // Login + logout API endpoints handle cookie minting/removal themselves;
    // bypass middleware so next-firebase-auth-edge can set/clear cookies.
    if (GC_FITNESS_API_PATHS.has(pathname)) {
      return NextResponse.next();
    }
    // Public auth pages — no session required.
    if (GC_FITNESS_PUBLIC_PATHS.has(pathname)) {
      return NextResponse.next();
    }

    // The Coach Wiki is intentionally PUBLIC — anyone with the link can read it
    // (no trainer session required). The page itself runs no auth check and
    // renders standalone (HIDDEN_SHELL_PATHS), so the only gate to lift is this
    // middleware. Prefix-match so any future wiki sub-page stays public too.
    if (
      pathname === "/gc-fitness/wiki" ||
      pathname.startsWith("/gc-fitness/wiki/")
    ) {
      return NextResponse.next();
    }

    // Legacy pending-client URL compatibility:
    //   /gc-fitness/clients/mirror:{email}
    // -> /gc-fitness/clients/pending/{email}
    // This avoids 404s when operators open old deep links.
    if (pathname.startsWith("/gc-fitness/clients/mirror:")) {
      const encodedEmail = pathname.slice("/gc-fitness/clients/mirror:".length);
      let normalizedEmail = encodedEmail;
      try {
        normalizedEmail = decodeURIComponent(encodedEmail);
      } catch {
        normalizedEmail = encodedEmail;
      }
      const redirectURL = new URL(
        `/gc-fitness/clients/pending/${encodeURIComponent(normalizedEmail)}`,
        request.url,
      );
      return NextResponse.redirect(redirectURL);
    }

    const cookieSignatureKey = process.env.GC_FITNESS_COOKIE_SIGNATURE_KEY;
    const apiKey = process.env.NEXT_PUBLIC_GC_FITNESS_FIREBASE_API_KEY;
    const projectId = process.env.NEXT_PUBLIC_GC_FITNESS_FIREBASE_PROJECT_ID;
    const clientEmail = process.env.GC_FITNESS_FIREBASE_ADMIN_CLIENT_EMAIL;
    const privateKeyB64 = process.env.GC_FITNESS_FIREBASE_ADMIN_PRIVATE_KEY;

    // CR-06 fix (P02-REVIEW-FIX): on missing env, return a hard 500 rather
    // than silently redirecting to /gc-fitness/login. The previous redirect
    // produced an infinite loop (login route runs without env check too,
    // mints a cookie that the middleware then rejects, redirects to login,
    // repeat) with no visible error to the trainer. A 500 + an explicit
    // server log is loud enough to be diagnosed from Vercel logs.
    if (
      !cookieSignatureKey ||
      !apiKey ||
      !projectId ||
      !clientEmail ||
      !privateKeyB64
    ) {
      const missing: string[] = [];
      if (!cookieSignatureKey) missing.push("GC_FITNESS_COOKIE_SIGNATURE_KEY");
      if (!apiKey) missing.push("NEXT_PUBLIC_GC_FITNESS_FIREBASE_API_KEY");
      if (!projectId) missing.push("NEXT_PUBLIC_GC_FITNESS_FIREBASE_PROJECT_ID");
      if (!clientEmail) missing.push("GC_FITNESS_FIREBASE_ADMIN_CLIENT_EMAIL");
      if (!privateKeyB64) missing.push("GC_FITNESS_FIREBASE_ADMIN_PRIVATE_KEY");
      // eslint-disable-next-line no-console
      console.error(
        "[gc-fitness/proxy] server misconfigured — missing env vars:",
        missing.join(", "),
      );
      return new NextResponse(
        "GC Fitness backoffice is misconfigured. Contact your administrator.",
        { status: 500 },
      );
    }

    return authMiddleware(request, {
      loginPath: "/api/gc-fitness/login",
      logoutPath: "/api/gc-fitness/logout",
      apiKey,
      cookieName: "GcFitnessAuthToken",
      cookieSignatureKeys: [cookieSignatureKey],
      cookieSerializeOptions: {
        path: "/",
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax" as const,
        maxAge: 12 * 60 * 60 * 24,
      },
      serviceAccount: {
        projectId,
        clientEmail,
        privateKey: Buffer.from(privateKeyB64, "base64").toString("utf8"),
      },
      handleValidToken: async ({ decodedToken }, headers) => {
        const email = decodedToken.email?.toLowerCase();
        if (!email) {
          return NextResponse.redirect(
            new URL("/gc-fitness/forbidden", request.url),
          );
        }
        return NextResponse.next({ request: { headers } });
      },
      handleInvalidToken: async () =>
        NextResponse.redirect(new URL("/gc-fitness/login", request.url)),
      handleError: async () =>
        NextResponse.redirect(new URL("/gc-fitness/login", request.url)),
    });
  }

  // ── Existing NextAuth branch (unchanged behavior from pre-02-03) ────
  // withAuth returns a Next.js middleware-shaped function. Invoke it with
  // the request + an empty event placeholder (NextAuth doesn't use it).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (nextAuthHandler as any)(request);
}

export const config = {
  matcher: [
    // Existing MyDNAMap / Pocket Gyms surfaces — same exclusions as pre-02-03
    // plus gc-fitness paths (handled in the branch above).
    "/((?!login|access-denied|botfarm|api/auth|api/sdk|_next/static|_next/image|favicon.ico|gc-fitness|api/gc-fitness).*)",
    "/gc-fitness/:path*",
    "/api/gc-fitness/login",
    "/api/gc-fitness/logout",
  ],
};
