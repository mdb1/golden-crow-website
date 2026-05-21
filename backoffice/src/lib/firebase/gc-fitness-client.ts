import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";

// Scoped Firebase Web SDK initializer for the gc-fitness Firebase project
// (`gcfitness-3476b`). The existing MyDNAMap / Pocket Gyms surfaces use the
// DEFAULT Firebase app (`src/lib/firebase.ts`); this file uses a NAMED app
// (`gc-fitness`) so both projects can coexist in the same Next.js process
// without colliding. Pattern reference: Phase 2 RESEARCH.md Pattern 5
// + Pitfall 7 (multi-app collision guard).
//
// All env vars are `NEXT_PUBLIC_*` because the Firebase Web SDK config is
// bundle-public by design (the API key is not a secret — Firestore Security
// Rules + Auth providers are the real access control surface). Admin-side
// privileged operations live in `gc-fitness-admin.ts` (server-only).

const GC_FITNESS_APP_NAME = "gc-fitness";

const gcFitnessConfig = {
  apiKey: process.env.NEXT_PUBLIC_GC_FITNESS_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_GC_FITNESS_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_GC_FITNESS_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_GC_FITNESS_FIREBASE_STORAGE_BUCKET,
  messagingSenderId:
    process.env.NEXT_PUBLIC_GC_FITNESS_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_GC_FITNESS_FIREBASE_APP_ID,
};

function getGCFitnessApp(): FirebaseApp {
  // Named-app guard: re-use the existing instance if Next.js hot-reload (or
  // duplicate module evaluation) already initialized it. Without this guard,
  // `initializeApp(config, "gc-fitness")` would throw on the second call.
  const existing = getApps().find((a) => a.name === GC_FITNESS_APP_NAME);
  return existing ?? initializeApp(gcFitnessConfig, GC_FITNESS_APP_NAME);
}

export function getGCFitnessAuth(): Auth {
  return getAuth(getGCFitnessApp());
}
