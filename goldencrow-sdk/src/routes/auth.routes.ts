import { FastifyInstance } from "fastify";
import { z } from "zod";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { adminAuth } from "../config/firebase.js";
import {
  getAdminCapabilities,
  resolveAdminContext,
} from "../repositories/roles.repository.js";

const LoginBodySchema = z.object({
  idToken: z.string().min(1, "idToken is required"),
});

export async function authRoutes(fastify: FastifyInstance): Promise<void> {
  const f = fastify.withTypeProvider<ZodTypeProvider>();

  f.post(
    "/auth/login",
    {
      schema: {
        body: LoginBodySchema,
      },
    },
    async (request, reply) => {
      const { idToken } = request.body;
      // 5 days in milliseconds
      const expiresIn = 1000 * 60 * 60 * 24 * 5;

      try {
        const decodedToken = await adminAuth.verifyIdToken(idToken, true);

        const adminContext = await resolveAdminContext({
          email: decodedToken.email,
          uid: decodedToken.uid,
        });

        if (!adminContext || !adminContext.canAccessBackoffice) {
          return reply.status(403).send({ error: "Account not authorized" });
        }

        const sessionCookie = await adminAuth.createSessionCookie(idToken, {
          expiresIn,
        });

        reply.setCookie("session", sessionCookie, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "strict",
          maxAge: expiresIn / 1000, // @fastify/cookie uses seconds
          path: "/",
        });

        return { status: "ok" };
      } catch {
        return reply.status(401).send({ error: "Invalid ID token" });
      }
    }
  );

  f.post("/auth/logout", async (_request, reply) => {
    reply.clearCookie("session", { path: "/" });
    return { status: "ok" };
  });

  f.get("/auth/context", async (request, reply) => {
    if (!request.adminContext) {
      return reply.status(401).send({ error: "No authenticated admin context" });
    }

    return reply.send({
      context: request.adminContext,
      capabilities: getAdminCapabilities(request.adminContext),
    });
  });
}
