import { FastifyInstance } from "fastify";
import { adminAuthFor } from "../config/firebase.js";

// Pitfall 16 — Health-check probes the mydnamap Firebase project (the
// canonical legacy connection). If pocket-gyms or gc-fitness connectivity
// also needs probing, add separate /health/* endpoints binding their own
// named-app handles.
const adminAuth = adminAuthFor("mydnamap");

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
