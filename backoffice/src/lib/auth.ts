import CredentialsProvider from "next-auth/providers/credentials";
import type { NextAuthOptions } from "next-auth";

const SDK_URL =
  process.env.GOLDENCROW_SDK_URL ??
  process.env.NEXT_PUBLIC_SDK_URL ??
  "http://localhost:3000";

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "Google via Firebase",
      credentials: {
        idToken: { type: "text" },
        name: { type: "text" },
        email: { type: "text" },
        image: { type: "text" },
      },
      async authorize(credentials) {
        if (!credentials?.idToken) return null;
        try {
          const res = await fetch(`${SDK_URL}/auth/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ idToken: credentials.idToken }),
          });
          if (!res.ok) return null;
          return {
            id: credentials.email!,
            name: credentials.name ?? null,
            email: credentials.email ?? null,
            image: credentials.image ?? null,
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
    async session({ session }) {
      return session;
    },
  },
};
