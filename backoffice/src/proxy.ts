import { NextResponse, type NextRequest } from "next/server";
import { authMiddleware } from "next-firebase-auth-edge";
import {
  cookieJar,
  getSessionSecret,
  isSecureRequest,
  readSessionFromCookies,
  shouldReissue,
  writeSessionCookie,
  type Session,
} from "@/lib/backoffice-session";

// Next.js 16 `proxy.ts` file convention (renamed from src/middleware.ts in 02-03).
// This file routes incoming requests to one of two auth stacks:
//
//   1. /gc-fitness/* and /api/gc-fitness/{login,logout}  →  next-firebase-auth-edge
//      (cookie-based SSR auth for the gc-fitness trainer surface; access is
//      based on a valid trainer session cookie minted by the Corvo login
//      flow. Public login/forbidden pages bypass the gate.)
//   2. /open-api/*                                      →  public OpenAPI
//      (client_id/client_secret and bearer tokens are validated inside handlers)
//   3. Everything else                                  →  `sessionGate`
//      (MyDNAMap / Pocket Gyms backoffice session cookie, #470 — was
//      NextAuth `withAuth`, same redirects)
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

const PATIENT_PORTAL_PUBLIC_PATHS = new Set([
  "/patient-portal/login",
  "/patient-portal/complete-profile",
]);

const PGFLEX_PUBLIC_PATHS = new Set([
  "/pgflex/login",
  "/pgflex/complete-profile",
]);

const PUBLISHER_PORTAL_PUBLIC_PATHS = new Set([
  "/publisher-portal/login",
  "/publisher-portal/complete-profile",
]);

// The app-request review embeds this public asset. If it reaches the main
// main session gate, a publisher session is redirected to /publisher-portal/home
// and the iframe renders that page instead of PDF bytes.
const PUBLIC_STATIC_DOCUMENT_PATHS = new Set([
  "/PocketGenesSDK_Terminos_y_Condiciones.pdf",
]);

// Pocket Genes / Pocket Gyms session gate (#470: replaces next-auth's
// `withAuth`, same semantics). No valid session → redirect to the surface's
// sign-in page with `?callbackUrl=<path+search>`; a valid one runs `onValid`
// (or passes through). A legacy next-auth cookie is accepted and re-issued as
// the new cookie on the response, and a day-old new cookie is rolled, so the
// session behaves like next-auth's 30-day rolling JWT.
type GateOptions = {
  signInPage: string;
  onValid?: (session: Session, request: NextRequest) => NextResponse;
};

async function sessionGate(request: NextRequest, options: GateOptions) {
  const read = await readSessionFromCookies(cookieJar(request.cookies));
  if (!read) {
    const signInUrl = new URL(options.signInPage, request.nextUrl.origin);
    signInUrl.searchParams.append(
      "callbackUrl",
      `${request.nextUrl.pathname}${request.nextUrl.search}`,
    );
    return NextResponse.redirect(signInUrl);
  }

  const response = options.onValid
    ? options.onValid(read.session, request)
    : NextResponse.next();

  if (shouldReissue(read)) {
    const secret = getSessionSecret();
    if (secret) {
      await writeSessionCookie(
        response.cookies,
        read.claims,
        isSecureRequest(request),
        secret,
      );
    }
  }
  return response;
}

function mainSurfaceRedirects(session: Session, request: NextRequest) {
  if (session.user.accessSurface === "pgflex") {
    return NextResponse.redirect(new URL("/pgflex/logistics", request.url));
  }

  if (session.user.accessSurface === "publisher-portal") {
    return NextResponse.redirect(
      new URL("/publisher-portal/home", request.url),
    );
  }

  return NextResponse.next();
}

export default async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (PUBLIC_STATIC_DOCUMENT_PATHS.has(pathname)) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/patient-portal")) {
    if (PATIENT_PORTAL_PUBLIC_PATHS.has(pathname)) {
      return NextResponse.next();
    }

    return sessionGate(request, { signInPage: "/patient-portal/login" });
  }

  if (pathname.startsWith("/pgflex")) {
    if (pathname === "/pgflex/login.") {
      return NextResponse.redirect(new URL("/pgflex/login", request.url));
    }

    if (PGFLEX_PUBLIC_PATHS.has(pathname)) {
      return NextResponse.next();
    }

    return sessionGate(request, { signInPage: "/pgflex/login" });
  }

  if (pathname.startsWith("/publisher-portal")) {
    if (PUBLISHER_PORTAL_PUBLIC_PATHS.has(pathname)) {
      return NextResponse.next();
    }

    return sessionGate(request, { signInPage: "/publisher-portal/login" });
  }

  if (pathname === "/open-api" || pathname.startsWith("/open-api/")) {
    return NextResponse.next();
  }

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
      if (!projectId)
        missing.push("NEXT_PUBLIC_GC_FITNESS_FIREBASE_PROJECT_ID");
      if (!clientEmail) missing.push("GC_FITNESS_FIREBASE_ADMIN_CLIENT_EMAIL");
      if (!privateKeyB64) missing.push("GC_FITNESS_FIREBASE_ADMIN_PRIVATE_KEY");
      // eslint-disable-next-line no-console
      console.error(
        "[gc-fitness/proxy] server misconfigured — missing env vars:",
        missing.join(", "),
      );
      return new NextResponse(
        "Corvo backoffice is misconfigured. Contact your administrator.",
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

  // ── Pocket Genes / Pocket Gyms main surface (was NextAuth `withAuth`) ──
  return sessionGate(request, {
    signInPage: "/login",
    onValid: mainSurfaceRedirects,
  });
}

export const config = {
  matcher: [
    // Existing MyDNAMap / Pocket Gyms surfaces — same exclusions as pre-02-03
    // plus gc-fitness paths (handled in the branch above).
    // `__` excludes the Firebase Auth handler paths (/__/auth/*, /__/firebase/*)
    // self-hosted via next.config rewrites (#378) — otherwise this middleware
    // would route them through the main session gate and redirect the handler to
    // /login, breaking the proxied sign-in flow.
    // `f` y `.well-known` son PÚBLICOS (#1037 / S6): `/f/r/{id}` es la landing del
    // link que alguien manda por WhatsApp — quien la abre normalmente no tiene
    // cuenta — y los dos archivos de `/.well-known/` los descargan los CDN de Apple
    // y Google, que no traen ninguna cookie. Sin esta exclusión los tres caen en la
    // rama de la sesión principal y terminan en /login: el link "no anda" y los Universal
    // Links fallan en silencio, porque un AASA que responde 302 es un AASA que no
    // existe.
    // Publisher-app API handlers validate the backoffice session themselves.
    // Keep them outside this browser-surface gate: a publisher-portal token
    // reaching the main callback is intentionally redirected to
    // /publisher-portal/home, which turns an expected JSON response into HTML.
    "/((?!login|access-denied|botfarm|api/auth|api/sdk|api/publisher-app|open-api|_next/static|_next/image|favicon.ico|PocketGenesSDK_Terminos_y_Condiciones\\.pdf|gc-fitness|api/gc-fitness|patient-portal|pgflex|publisher-portal|f/|\\.well-known|__).*)",
    "/patient-portal/:path*",
    "/pgflex/:path*",
    "/publisher-portal/:path*",
    "/gc-fitness/:path*",
    "/api/gc-fitness/login",
    "/api/gc-fitness/logout",
  ],
};
