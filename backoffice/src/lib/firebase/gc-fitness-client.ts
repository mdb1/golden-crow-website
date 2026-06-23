import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import {
  getAnalytics,
  isSupported as isAnalyticsSupported,
  type Analytics,
} from "firebase/analytics";
import { getAuth, type Auth } from "firebase/auth";
import {
  getPerformance,
  type FirebasePerformance,
} from "firebase/performance";
import { getStorage, type FirebaseStorage } from "firebase/storage";

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

// #378 — resolve the Firebase Auth handler domain. When self-hosting is enabled
// (NEXT_PUBLIC_GC_FITNESS_AUTH_SELF_HOSTED=true, set in production), point
// authDomain at OUR OWN origin so the auth handler is served same-origin via the
// /__/auth/* + /__/firebase/* rewrites in next.config.ts. That keeps the
// handler's storage first-party, which privacy browsers (Brave / Safari ITP /
// Firefox ETP) allow — fixing the bounce-back-to-/login on Brave mobile.
//
// Gated + window-guarded so it only kicks in client-side in production. Preview
// deploys and localhost keep the default cross-origin firebaseapp.com domain so
// every ephemeral Vercel URL doesn't need to be added to Authorized domains.
function resolveGCFitnessAuthDomain(): string | undefined {
  const fallback = process.env.NEXT_PUBLIC_GC_FITNESS_FIREBASE_AUTH_DOMAIN;
  if (
    process.env.NEXT_PUBLIC_GC_FITNESS_AUTH_SELF_HOSTED === "true" &&
    typeof window !== "undefined"
  ) {
    return window.location.host;
  }
  return fallback;
}

const gcFitnessConfig = {
  apiKey: process.env.NEXT_PUBLIC_GC_FITNESS_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_GC_FITNESS_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_GC_FITNESS_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_GC_FITNESS_FIREBASE_STORAGE_BUCKET,
  messagingSenderId:
    process.env.NEXT_PUBLIC_GC_FITNESS_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_GC_FITNESS_FIREBASE_APP_ID,
  // Optional — only present if Analytics has been enabled in the Firebase
  // Console for this project (web app config will populate it). Safe to be
  // undefined; getAnalytics() will skip silently.
  measurementId:
    process.env.NEXT_PUBLIC_GC_FITNESS_FIREBASE_MEASUREMENT_ID,
};

function getGCFitnessApp(): FirebaseApp {
  // Named-app guard: re-use the existing instance if Next.js hot-reload (or
  // duplicate module evaluation) already initialized it. Without this guard,
  // `initializeApp(config, "gc-fitness")` would throw on the second call.
  const existing = getApps().find((a) => a.name === GC_FITNESS_APP_NAME);
  // Resolve authDomain at init time (not module-eval) so the client-side
  // window.location.host override (#378 self-hosting) is in effect. Sign-in only
  // runs client-side, so the app is first initialized with `window` present.
  return (
    existing ??
    initializeApp(
      { ...gcFitnessConfig, authDomain: resolveGCFitnessAuthDomain() },
      GC_FITNESS_APP_NAME,
    )
  );
}

export function getGCFitnessAuth(): Auth {
  return getAuth(getGCFitnessApp());
}

export function getGCFitnessStorage(): FirebaseStorage {
  return getStorage(getGCFitnessApp());
}

// Analytics + Performance — both web SDKs require `window` and are safe-noop
// on the server. Lazy-cached singletons so HMR / re-renders don't re-init.

let analyticsInstance: Analytics | null = null;
let analyticsInitPromise: Promise<Analytics | null> | null = null;
/**
 * Returns the GC Fitness Analytics instance lazily. Resolves to `null` on
 * SSR / unsupported browsers (e.g. private-mode without storage). Safe to
 * call from a useEffect on the client; idempotent across HMR.
 */
export function getGCFitnessAnalytics(): Promise<Analytics | null> {
  if (typeof window === "undefined") return Promise.resolve(null);
  if (analyticsInstance) return Promise.resolve(analyticsInstance);
  if (analyticsInitPromise) return analyticsInitPromise;
  analyticsInitPromise = isAnalyticsSupported()
    .then((supported) => {
      if (!supported) return null;
      analyticsInstance = getAnalytics(getGCFitnessApp());
      return analyticsInstance;
    })
    .catch(() => null);
  return analyticsInitPromise;
}

let performanceInstance: FirebasePerformance | null = null;
/**
 * Returns the GC Fitness Performance Monitoring instance lazily. Safe-noop
 * on the server. The SDK auto-traces page load + HTTPS network requests.
 */
export function getGCFitnessPerformance(): FirebasePerformance | null {
  if (typeof window === "undefined") return null;
  if (performanceInstance) return performanceInstance;
  try {
    performanceInstance = getPerformance(getGCFitnessApp());
  } catch {
    performanceInstance = null;
  }
  return performanceInstance;
}
