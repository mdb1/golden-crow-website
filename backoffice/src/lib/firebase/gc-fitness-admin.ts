import "server-only";

import { initializeApp, getApps, cert, type App } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { getStorage, type Storage } from "firebase-admin/storage";

// Server-only Firebase Admin SDK initializer for the gc-fitness Firebase
// project (`gcfitness-3476b`). The `import "server-only"` directive on line 1
// is CRITICAL: it makes Webpack/Turbopack throw a build error if any client
// component (or shared module that ends up in a client bundle) imports this
// file. Without it, the service-account private key + admin credentials would
// leak into the browser bundle.
//
// Multi-app pattern: a NAMED app (`gc-fitness`) is used so this initializer
// coexists with any other firebase-admin default app that other surfaces
// might add. The named-app guard prevents `initializeApp` from throwing on
// subsequent calls (Next.js dev server hot-reloads re-evaluate modules).
//
// Private-key handling: the GC_FITNESS_FIREBASE_ADMIN_PRIVATE_KEY env var is
// base64-encoded (avoids newline/escape issues in Vercel env UI). It is
// decoded once per cold start during `getOrInit()`.

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
