import { NextResponse } from "next/server";
import { setAuthCookies } from "next-firebase-auth-edge/lib/next/cookies";
import { gcFitnessAuth } from "@/lib/firebase/gc-fitness-admin";

// POST /api/gc-fitness/login
//
// Mints the next-firebase-auth-edge session cookie for the gc-fitness trainer
// surface. The flow:
//   1. Client (login page) calls signInWithPopup(GoogleAuthProvider) on the
//      scoped Firebase Web SDK, then POSTs the resulting idToken to this
//      endpoint via the `Authorization: Bearer <idToken>` header.
//   2. We verify the idToken server-side via gcFitnessAuth() (the named-app
//      Admin SDK init for gcfitness-3476b) — this is the FIRST line of defense
//      against forged tokens.
//   3. We check the decoded email against GC_FITNESS_TEAM_ALLOWLIST. If the
//      email is not on the allowlist we return 403 WITHOUT calling
//      setAuthCookies, so no cookie is minted (defense in depth — the proxy.ts
//      `handleValidToken` is a second gate for any cookie that somehow leaked).
//   4. On allowlisted accounts we delegate to next-firebase-auth-edge's
//      `setAuthCookies(request.headers, options)` which re-verifies the
//      idToken internally and returns a NextResponse with Set-Cookie headers
//      attached. We forward that response as-is.
//
// The Authorization-header transport (rather than a JSON body field) is
// REQUIRED — the library reads the idToken from `request.headers` by default.

// CR-03 fix (P02-REVIEW-FIX): the allowlist is now parsed INSIDE the POST
// handler on every invocation, not once at module load. The previous
// module-scope `ALLOWLIST` constant cached the env var for the lifetime of
// the warm Vercel container, so a removal from GC_FITNESS_TEAM_ALLOWLIST
// would continue to mint valid session cookies for that email until the
// container recycled (potentially hours on a low-traffic site). The
// middleware (proxy.ts) already reads the env var per-request; this brings
// the cookie-mint path in line with that contract.
function parseAllowlist(raw: string | undefined): string[] {
  return (raw ?? "")
    .toLowerCase()
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function POST(request: Request) {
  const allowlist = parseAllowlist(process.env.GC_FITNESS_TEAM_ALLOWLIST);

  const authHeader = request.headers.get("authorization") ?? "";
  const idToken = authHeader.toLowerCase().startsWith("bearer ")
    ? authHeader.slice(7).trim()
    : null;

  if (!idToken) {
    return NextResponse.json(
      { error: "Missing Authorization: Bearer <idToken> header" },
      { status: 400 },
    );
  }

  try {
    const decoded = await gcFitnessAuth().verifyIdToken(idToken);
    const email = decoded.email?.toLowerCase();
    if (!email || !allowlist.includes(email)) {
      return NextResponse.json({ error: "Not on allowlist" }, { status: 403 });
    }

    return setAuthCookies(request.headers, {
      apiKey: process.env.NEXT_PUBLIC_GC_FITNESS_FIREBASE_API_KEY!,
      cookieName: "GcFitnessAuthToken",
      cookieSignatureKeys: [process.env.GC_FITNESS_COOKIE_SIGNATURE_KEY!],
      cookieSerializeOptions: {
        path: "/",
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax" as const,
        maxAge: 12 * 60 * 60 * 24,
      },
      serviceAccount: {
        projectId: process.env.NEXT_PUBLIC_GC_FITNESS_FIREBASE_PROJECT_ID!,
        clientEmail: process.env.GC_FITNESS_FIREBASE_ADMIN_CLIENT_EMAIL!,
        privateKey: Buffer.from(
          process.env.GC_FITNESS_FIREBASE_ADMIN_PRIVATE_KEY!,
          "base64",
        ).toString("utf8"),
      },
    });
  } catch {
    return NextResponse.json(
      { error: "Authentication failed" },
      { status: 403 },
    );
  }
}
