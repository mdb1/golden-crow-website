import "server-only";

import { initializeApp, getApps, cert, type App } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { getStorage, type Storage } from "firebase-admin/storage";

// ---------------------------------------------------------------------------
// Pitfall 16 — Named-App Per-Project Firebase Admin Registry (backoffice
// process side). This module is one of TWO sibling implementations of the
// same named-app pattern across the `golden-crow-website` workspace:
//
//   1. goldencrow-sdk/src/config/firebase.ts — registry for the SDK's
//      Fastify-on-Vercel function. Owns the typed `ProjectKey`-keyed
//      `adminAppFor / adminAuthFor / adminDbFor / adminStorageFor`
//      multi-project registry. Source of truth for the PATTERN.
//
//   2. THIS FILE (backoffice/src/lib/firebase/gc-fitness-admin.ts) — the
//      backoffice Next.js process's mirror for the gc-fitness project
//      ONLY. Lives in a separate Vercel function (`backoffice`) with
//      its own process memory + cold-start lifecycle, so it does NOT
//      share the SDK's process-global firebase-admin app registry.
//      That is why this file maintains its own `getOrInit()` instead
//      of importing from the SDK at runtime.
//
// Invariant (Pitfall 16): EVERY `initializeApp(...)` call site in the
// `golden-crow-website` workspace passes an explicit project-key name
// argument (here: `APP_NAME = "gc-fitness"`). The PR-check script at
// `golden-crow-website/scripts/check-no-default-app.sh` scans both
// directories and exits non-zero if any default-app call sneaks back in.
//
// Cross-reference (Pitfall 7 — same source of truth): if you change
// `getOrInit()` here (env-var name, base64 decode, cert shape, error
// message), apply the equivalent change in
// `goldencrow-sdk/src/config/firebase.ts`. The two files are independent
// processes but share the named-app PATTERN; PRs that touch one without
// the other should be flagged in code review.
//
// Server-only guard: the `import "server-only"` directive on line 1 is
// CRITICAL: it makes Webpack/Turbopack throw a build error if any client
// component (or shared module that ends up in a client bundle) imports
// this file. Without it, the service-account private key + admin
// credentials would leak into the browser bundle.
//
// Private-key handling: the GC_FITNESS_FIREBASE_ADMIN_PRIVATE_KEY env
// var is base64-encoded (avoids newline/escape issues in Vercel env UI).
// It is decoded once per cold start during `getOrInit()`.
// ---------------------------------------------------------------------------

const APP_NAME = "gc-fitness";

function getOrInit(): App {
  const existing = getApps().find((a) => a.name === APP_NAME);
  if (existing) return existing;

  const clientEmail = process.env.GC_FITNESS_FIREBASE_ADMIN_CLIENT_EMAIL;
  const projectId = process.env.NEXT_PUBLIC_GC_FITNESS_FIREBASE_PROJECT_ID;
  const privateKeyB64 = process.env.GC_FITNESS_FIREBASE_ADMIN_PRIVATE_KEY;

  if (!clientEmail || !projectId || !privateKeyB64) {
    throw new Error(
      "gc-fitness-admin: missing required env vars (NEXT_PUBLIC_GC_FITNESS_FIREBASE_PROJECT_ID, GC_FITNESS_FIREBASE_ADMIN_CLIENT_EMAIL, GC_FITNESS_FIREBASE_ADMIN_PRIVATE_KEY)",
    );
  }

  const privateKey = Buffer.from(privateKeyB64, "base64").toString("utf8");

  return initializeApp(
    {
      credential: cert({ projectId, clientEmail, privateKey }),
    },
    APP_NAME,
  );
}

export function gcFitnessAdminApp(): App {
  return getOrInit();
}

export function gcFitnessAuth(): Auth {
  return getAuth(getOrInit());
}

export function gcFitnessFirestore(): Firestore {
  return getFirestore(getOrInit());
}

// Scoped Cloud Storage accessor — first consumer is P03-05's
// `mintExerciseMediaUploadUrl` Server Action (v4 signed URLs for trainer
// MP4 uploads to `gs://gcfitness-3476b.firebasestorage.app/exercises/*`).
// Using a wrapper instead of `getStorage(gcFitnessAdminApp())` at the call
// site keeps the multi-app pattern consistent and gives the Jest tests a
// clean module-level mock target.
export function gcFitnessStorage(): Storage {
  return getStorage(getOrInit());
}
