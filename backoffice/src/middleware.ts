import { withAuth } from "next-auth/middleware";

export default withAuth({
  pages: {
    signIn: "/login",
    error: "/access-denied",
  },
});

export const config = {
  matcher: [
    "/((?!login|access-denied|api/auth|api/sdk|_next/static|_next/image|favicon.ico).*)",
  ],
};
