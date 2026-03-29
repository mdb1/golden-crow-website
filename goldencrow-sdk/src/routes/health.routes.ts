import { FastifyInstance } from "fastify";
import { adminAuth } from "../config/firebase.js";

export async function healthRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get("/health", async (_request, reply) => {
    try {
      // Minimal Firebase call to confirm real connectivity (not just Fastify running)
      await adminAuth.listUsers(1);
      return { status: "ok", firebase: "connected" };
    } catch (err) {
      reply.status(503);
      return { status: "error", firebase: "disconnected" };
    }
  });
}
