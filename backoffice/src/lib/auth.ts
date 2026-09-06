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
          return {
            id: credentials.email!,
            name: credentials.name ?? null,
            email: credentials.email ?? null,
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
