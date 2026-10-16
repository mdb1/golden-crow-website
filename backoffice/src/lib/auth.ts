import CredentialsProvider from "next-auth/providers/credentials";
import type { NextAuthOptions } from "next-auth";

const SDK_URL =
  process.env.GOLDENCROW_SDK_URL ??
  process.env.NEXT_PUBLIC_SDK_URL ??
  "http://localhost:3000";

type AccessSurface =
  "backoffice" | "patient-portal" | "pgflex" | "publisher-portal";

function normalizeAccessSurface(value: unknown): AccessSurface {
  return value === "patient-portal" ||
    value === "pgflex" ||
    value === "publisher-portal"
    ? value
    : "backoffice";
}

async function readVerifiedIdentity(
  res: Response,
): Promise<{ uid: string | null; email: string | null }> {
  try {
    const body = (await res.json()) as { uid?: unknown; email?: unknown };
    return {
      uid: typeof body?.uid === "string" && body.uid ? body.uid : null,
      email: typeof body?.email === "string" && body.email ? body.email : null,
    };
  } catch {
    return { uid: null, email: null };
  }
}

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "Google via Firebase",
      credentials: {
        idToken: { type: "text" },
        name: { type: "text" },
        email: { type: "text" },
        image: { type: "text" },
        project: { type: "text" },
        accessSurface: { type: "text" },
      },
      async authorize(credentials) {
        if (!credentials?.idToken) return null;
        const accessSurface = normalizeAccessSurface(credentials.accessSurface);
        try {
          const res = await fetch(`${SDK_URL}/auth/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              idToken: credentials.idToken,
              surface: accessSurface,
            }),
          });
          if (!res.ok) return null;
          // The SDK verifies the idToken and returns the identity it
          // contains. That verified identity is authoritative: the
          // `credentials.email` field is whatever the browser posted and can
          // be spoofed. The credentials fallback exists only for deploy-order
          // safety — an SDK deployed before it started returning uid/email
          // replies `{ status: "ok" }` alone, and login must keep working
          // until both sides ship.
          const verified = await readVerifiedIdentity(res);
          const email = verified.email ?? credentials.email ?? null;
          return {
            // Nothing reads token.sub today; the Firebase uid is the stable key.
            id: verified.uid ?? email ?? credentials.email!,
            name: credentials.name ?? null,
            email,
            image: credentials.image ?? null,
            project: credentials.project ?? "mydnamap",
            accessSurface,
          };
        } catch {
          return null;
        }
      },
    }),
  ],
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
    error: "/access-denied",
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.project = (user as { project?: string }).project ?? "mydnamap";
        token.accessSurface = normalizeAccessSurface(
          (user as { accessSurface?: string }).accessSurface,
        );
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.project) {
        session.user.project = token.project as string;
      }
      if (session.user) {
        session.user.accessSurface = normalizeAccessSurface(
          token.accessSurface,
        );
      }
      return session;
    },
  },
};
