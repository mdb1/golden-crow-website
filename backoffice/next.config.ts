import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

// next-intl plugin loads `src/i18n/request.ts` at build time so getRequestConfig
// is wired into RSC + middleware. Plan 13-03 — scoped to the gc-fitness route
// subtree via NextIntlClientProvider in `app/gc-fitness/layout.tsx`.
const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "lh3.googleusercontent.com" }, // Google profile photos
      { protocol: "https", hostname: "storage.googleapis.com" },
    ],
  },
};

export default withNextIntl(nextConfig);
