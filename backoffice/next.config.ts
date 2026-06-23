import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

// next-intl plugin loads `src/i18n/request.ts` at build time so getRequestConfig
// is wired into RSC + middleware. Plan 13-03 — scoped to the gc-fitness route
// subtree via NextIntlClientProvider in `app/gc-fitness/layout.tsx`.
const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

// #378 — Brave / privacy-browser sign-in. The GC Fitness Firebase Auth handler
// normally lives on the cross-origin domain gcfitness-3476b.firebaseapp.com.
// Brave (and Safari ITP / Firefox ETP) block that cross-origin handler's
// storage, so signInWithPopup is blocked and signInWithRedirect's
// getRedirectResult comes back empty — trainers bounce straight back to /login.
//
// Fix: serve the handler SAME-ORIGIN by proxying /__/auth/* and /__/firebase/*
// from our domain to the project's firebaseapp.com handler, paired with the
// gc-fitness Web SDK authDomain set to our own origin (see gc-fitness-client.ts,
// gated by NEXT_PUBLIC_GC_FITNESS_AUTH_SELF_HOSTED). The OAuth redirect_uri sent
// to Google stays firebaseapp.com (Firebase's internal flow), so the only extra
// console step is adding the production domain to the project's Auth "Authorized
// domains".
//
// MyDNAMap is UNAFFECTED: its authDomain stays goldencrow-pocketgenes
// .firebaseapp.com, so its handler requests go to firebaseapp.com directly and
// never hit our domain's /__/auth/*. When self-hosting is disabled (preview /
// localhost) nothing requests these paths on our domain and the rewrite is
// dormant.
const GC_FITNESS_AUTH_HANDLER_HOST =
  process.env.NEXT_PUBLIC_GC_FITNESS_FIREBASE_AUTH_DOMAIN ??
  "gcfitness-3476b.firebaseapp.com";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "lh3.googleusercontent.com" }, // Google profile photos
      { protocol: "https", hostname: "storage.googleapis.com" },
      { protocol: "https", hostname: "firebasestorage.googleapis.com" },
    ],
  },
  async rewrites() {
    return [
      {
        source: "/__/auth/:path*",
        destination: `https://${GC_FITNESS_AUTH_HANDLER_HOST}/__/auth/:path*`,
      },
      {
        source: "/__/firebase/:path*",
        destination: `https://${GC_FITNESS_AUTH_HANDLER_HOST}/__/firebase/:path*`,
      },
    ];
  },
};

export default withNextIntl(nextConfig);
