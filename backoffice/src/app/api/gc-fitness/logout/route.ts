import { removeAuthCookies } from "next-firebase-auth-edge/lib/next/cookies";

// POST /api/gc-fitness/logout
//
// Symmetric exit endpoint to /api/gc-fitness/login. Clears the
// next-firebase-auth-edge session cookie (and any refresh-cookie sibling the
// library uses) by calling `removeAuthCookies(request.headers, options)`.
// The cookieName + cookieSerializeOptions MUST match what /login set so the
// library can emit a Set-Cookie header with matching path/domain/secure flags
// that correctly invalidates the prior cookie in the browser.
//
// `removeAuthCookies` is synchronous in next-firebase-auth-edge 1.12 (returns
// NextResponse, not Promise<NextResponse>).
export function POST(request: Request) {
  return removeAuthCookies(request.headers, {
    cookieName: "GcFitnessAuthToken",
    cookieSerializeOptions: {
      path: "/",
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax" as const,
    },
  });
}
