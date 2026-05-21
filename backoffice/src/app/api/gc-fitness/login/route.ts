import { NextResponse } from "next/server";
import type { DecodedIdToken } from "firebase-admin/auth";
import { FieldValue } from "firebase-admin/firestore";
import { setAuthCookies } from "next-firebase-auth-edge/lib/next/cookies";
import {
  gcFitnessAuth,
  gcFitnessFirestore,
} from "@/lib/firebase/gc-fitness-admin";
import { FirestoreCollections } from "@/lib/gc-fitness/collections";

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
//   3. We promote the signed-in Firebase Auth user to a GC Fitness trainer
//      by setting custom claims (`role: "trainer"`).
//   4. We delegate to next-firebase-auth-edge's `setAuthCookies(...)` which
//      re-verifies the idToken internally and returns a NextResponse with
//      Set-Cookie headers attached. We forward that response as-is.
//
// The Authorization-header transport (rather than a JSON body field) is
// REQUIRED — the library reads the idToken from `request.headers` by default.

function fallbackName(email: string): string {
  const localPart = email.split("@")[0] ?? email;
  return localPart || email;
}

async function upsertTrainerProfile(
  decoded: DecodedIdToken,
  email: string,
): Promise<void> {
  const ref = gcFitnessFirestore()
    .collection(FirestoreCollections.users)
    .doc(decoded.uid);
  const snap = await ref.get();
  const existing = snap.exists ? snap.data() ?? {} : {};
  const token = decoded as DecodedIdToken & {
    name?: string;
    picture?: string;
  };
  await ref.set(
    {
      email,
      displayName:
        typeof existing.displayName === "string" &&
        existing.displayName.trim().length > 0
          ? existing.displayName
          : token.name || fallbackName(email),
      photoURL:
        typeof existing.photoURL === "string" && existing.photoURL.length > 0
          ? existing.photoURL
          : token.picture ?? null,
      role: "trainer",
      coachId: null,
      preferences: existing.preferences ?? {},
      fcmTokens: existing.fcmTokens ?? [],
      deleted: false,
      createdAt: existing.createdAt ?? FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
}

// CR-06 fix (P02-REVIEW-FIX): explicit env-var guard. The previous code used
// `process.env.X!` non-null assertions at five call sites — if any env var
// was missing, the assertion would silently produce `undefined` and the
// downstream library could sign cookies with an undefined key, producing
// cookies that the middleware later fails to verify. Validate at the top of
// the handler and return 500 with a clear log so misconfiguration is loud,
// not silent.
function readRequiredEnv(): {
  apiKey: string;
  cookieSignatureKey: string;
  projectId: string;
  clientEmail: string;
  privateKeyB64: string;
} | { error: string } {
  const apiKey = process.env.NEXT_PUBLIC_GC_FITNESS_FIREBASE_API_KEY;
  const cookieSignatureKey = process.env.GC_FITNESS_COOKIE_SIGNATURE_KEY;
  const projectId = process.env.NEXT_PUBLIC_GC_FITNESS_FIREBASE_PROJECT_ID;
  const clientEmail = process.env.GC_FITNESS_FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKeyB64 = process.env.GC_FITNESS_FIREBASE_ADMIN_PRIVATE_KEY;
  const missing: string[] = [];
  if (!apiKey) missing.push("NEXT_PUBLIC_GC_FITNESS_FIREBASE_API_KEY");
  if (!cookieSignatureKey) missing.push("GC_FITNESS_COOKIE_SIGNATURE_KEY");
  if (!projectId) missing.push("NEXT_PUBLIC_GC_FITNESS_FIREBASE_PROJECT_ID");
  if (!clientEmail) missing.push("GC_FITNESS_FIREBASE_ADMIN_CLIENT_EMAIL");
  if (!privateKeyB64) missing.push("GC_FITNESS_FIREBASE_ADMIN_PRIVATE_KEY");
  if (missing.length > 0) {
    return { error: `Missing required env vars: ${missing.join(", ")}` };
  }
  // Narrowed: every value is non-empty string here.
  return {
    apiKey: apiKey as string,
    cookieSignatureKey: cookieSignatureKey as string,
    projectId: projectId as string,
    clientEmail: clientEmail as string,
    privateKeyB64: privateKeyB64 as string,
  };
}

export async function POST(request: Request) {
  const env = readRequiredEnv();
  if ("error" in env) {
    // eslint-disable-next-line no-console
    console.error("[gc-fitness/login] server misconfigured:", env.error);
    return NextResponse.json(
      { error: "Server misconfigured" },
      { status: 500 },
    );
  }

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
    if (!email) {
      return NextResponse.json({ error: "Missing email" }, { status: 403 });
    }

    try {
      await gcFitnessAuth().setCustomUserClaims(decoded.uid, {
        ...(decoded as DecodedIdToken & {
          customClaims?: Record<string, unknown>;
        }).customClaims,
        role: "trainer",
      });
    } catch (claimErr) {
      // eslint-disable-next-line no-console
      console.warn(
        "[gc-fitness/login] could not persist trainer claim; continuing with session cookie:",
        claimErr,
      );
    }
    await upsertTrainerProfile(decoded, email);

    return setAuthCookies(request.headers, {
      apiKey: env.apiKey,
      cookieName: "GcFitnessAuthToken",
      cookieSignatureKeys: [env.cookieSignatureKey],
      cookieSerializeOptions: {
        path: "/",
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax" as const,
        maxAge: 12 * 60 * 60 * 24,
      },
      serviceAccount: {
        projectId: env.projectId,
        clientEmail: env.clientEmail,
        privateKey: Buffer.from(env.privateKeyB64, "base64").toString("utf8"),
      },
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[gc-fitness/login] authentication failed:", err);
    return NextResponse.json(
      { error: "Authentication failed" },
      { status: 403 },
    );
  }
}
