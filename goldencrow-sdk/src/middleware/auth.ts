import { FastifyRequest, FastifyReply } from "fastify";
import "@fastify/cookie";
import { adminAuthFor } from "../config/firebase.js";

// Pitfall 16 — Session cookies are minted by the MyDNAMap project (see
// auth.routes.ts:104). The /gym/* application-level access check below
// (line ~37) is a role-based gate on the SAME mydnamap-issued session,
// not a separate Pocket Gyms session. So `adminAuth` is bound to the
// mydnamap named-app. If a future plan adds a Pocket-Gyms-issued session
// flow, that flow gets its OWN middleware bound to adminAuthFor("pocket-gyms").
const adminAuth = adminAuthFor("mydnamap");
import { resolveAdminContext } from "../repositories/roles.repository.js";

const PATIENT_PORTAL_SDK_PATHS = new Set([
  "/auth/context",
  "/auth/my-account",
  "/auth/my-account/role",
  "/auth/my-account/email",
  "/auth/profile-setup",
]);

function isPatientPortalSdkPath(path: string) {
  return (
    PATIENT_PORTAL_SDK_PATHS.has(path) ||
    path === "/2pq/informed-consents" ||
    path.startsWith("/2pq/informed-consents/")
  );
}

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

    if (
      !adminContext ||
      (!adminContext.canAccessBackoffice &&
        !adminContext.canAccessPatientPortal)
    ) {
      return reply.status(403).send({ error: "Account not authorized" });
    }

    const requestPath = request.url.split("?")[0] ?? request.url;
    if (
      adminContext.canAccessPatientPortal &&
      !adminContext.canAccessBackoffice &&
      !isPatientPortalSdkPath(requestPath)
    ) {
      return reply.status(403).send({
        error: "This patient portal session cannot access backoffice APIs",
      });
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
