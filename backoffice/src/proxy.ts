import { withAuth } from "next-auth/middleware";

// Renamed from src/middleware.ts to src/proxy.ts per Next.js 16 file-convention rename
// (middleware-to-proxy). The `proxy` file convention replaces `middleware` starting in
// Next.js 16; functional behavior is identical. NextAuth's `withAuth` returns a function
// suitable for use as the default export of either a `middleware.ts` or `proxy.ts` file.
//
// gc-fitness routes (`/gc-fitness/*`, `/api/login`, `/api/logout`) are excluded from the
// NextAuth-handled matcher entry and listed explicitly. Auth wiring for gc-fitness using
// next-firebase-auth-edge lands in plan 02-11; this plan only stages the rename + extends
// the matcher so the foundation is non-breaking.
export default withAuth({
  pages: {
    signIn: "/login",
    error: "/access-denied",
  },
});

export const config = {
  matcher: [
    "/((?!login|access-denied|botfarm|api/auth|api/sdk|_next/static|_next/image|favicon.ico|gc-fitness|api/login|api/logout).*)",
    "/gc-fitness/:path*",
    "/api/login",
    "/api/logout",
  ],
};
