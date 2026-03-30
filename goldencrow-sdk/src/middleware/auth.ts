import { FastifyRequest, FastifyReply } from "fastify";
import "@fastify/cookie";
import { adminAuth } from "../config/firebase.js";
import { resolveAdminContext } from "../repositories/roles.repository.js";

export async function authMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const sessionCookie = request.cookies["session"] ?? "";

  if (!sessionCookie) {
    return reply.status(401).send({ error: "No session cookie" });
  }

  try {
    // true = check revocation (REQUIRED — without this, revoked tokens remain valid)
    const decodedClaims = await adminAuth.verifySessionCookie(
      sessionCookie,
      true
    );

    const adminContext = await resolveAdminContext({
      email: decodedClaims.email,
      uid: decodedClaims.uid,
    });

    if (!adminContext || !adminContext.canAccessBackoffice) {
      return reply.status(403).send({ error: "Account not authorized" });
    }

    // Attach decoded claims to request for downstream route handlers
    request.user = decodedClaims;
    request.adminContext = adminContext;

    // Project-level access enforcement for /gym/* routes (per D-13)
    if (request.url.startsWith("/gym/") || request.url === "/gym") {
      const hasGymAccess = adminContext.projectAccess.includes("pocket-gyms");
      if (!hasGymAccess) {
        return reply.status(403).send({ error: "No access to pocket-gyms project" });
      }
    }
  } catch {
    return reply.status(401).send({ error: "Invalid or expired session" });
  }
}
