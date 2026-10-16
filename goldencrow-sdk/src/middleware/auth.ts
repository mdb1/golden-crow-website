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
  "/auth/profile-setup/patient",
]);

const PGFLEX_SDK_PATHS = new Set([
  "/auth/context",
  "/auth/my-account",
  "/auth/my-account/role",
  "/auth/my-account/email",
  "/auth/profile-setup",
  "/auth/profile-setup/pgflex",
  "/pgflex/logistics",
]);

const PUBLISHER_PORTAL_SDK_PATHS = new Set([
  "/auth/context",
  "/auth/my-account",
  "/auth/my-account/role",
  "/auth/my-account/email",
  "/auth/profile-setup",
  "/auth/profile-setup/publisher",
  "/discover/organizations",
  "/discover/individuals",
  "/discover/feed-items",
]);

export function isPatientPortalSdkPath(path: string) {
  return (
    PATIENT_PORTAL_SDK_PATHS.has(path) ||
    path === "/2pq/informed-consents" ||
    path.startsWith("/2pq/informed-consents/")
  );
}

export function isPGFlexSdkPath(path: string) {
  return PGFLEX_SDK_PATHS.has(path) || path.startsWith("/pgflex/logistics/");
}

export function isPublisherPortalSdkPath(path: string) {
  if (path.endsWith("/submission-evaluation")) {
    return false;
  }

  return (
    PUBLISHER_PORTAL_SDK_PATHS.has(path) ||
    path.startsWith("/discover/organizations/") ||
    path.startsWith("/discover/individuals/") ||
    path.startsWith("/discover/feed-items/") ||
    path === "/admin/support-services/offers" ||
    path.startsWith("/admin/support-services/offers/") ||
    path === "/admin/support-services/transactions" ||
    path.startsWith("/admin/support-services/transactions/")
  );
}

/** The path without the query string, percent-decoded the way the router decodes it. */
function decodedRequestPath(request: FastifyRequest): string {
  const raw = request.url.split("?")[0] ?? request.url;
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

export async function authMiddleware(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const sessionCookie = request.cookies["session"] ?? "";

  if (!sessionCookie) {
    return reply.status(401).send({ error: "No session cookie" });
  }

  try {
    // true = check revocation (REQUIRED — without this, revoked tokens remain valid)
    const decodedClaims = await adminAuth.verifySessionCookie(
      sessionCookie,
      true,
    );

    const adminContext = await resolveAdminContext({
      email: decodedClaims.email,
      uid: decodedClaims.uid,
    });

    if (
      !adminContext ||
      (!adminContext.canAccessBackoffice &&
        !adminContext.canAccessPatientPortal &&
        !adminContext.canAccessPGFlex &&
        !adminContext.canAccessPublisherPortal)
    ) {
      return reply.status(403).send({ error: "Account not authorized" });
    }

    const requestPath = decodedRequestPath(request);
    // Without backoffice access, the path must belong to at least one portal
    // the account holds — the UNION of its portals. Each restriction used to
    // fire only when its portal was the account's ONLY surface, so two
    // non-backoffice portals (e.g. patient + PGFlex) fell through to the
    // whole backoffice API (#451).
    if (!adminContext.canAccessBackoffice) {
      const heldPortals = [
        {
          held: adminContext.canAccessPatientPortal,
          allows: isPatientPortalSdkPath,
          error: "This patient portal session cannot access backoffice APIs",
        },
        {
          held: adminContext.canAccessPGFlex,
          allows: isPGFlexSdkPath,
          error: "This PGFlex session cannot access backoffice APIs",
        },
        {
          held: adminContext.canAccessPublisherPortal,
          allows: isPublisherPortalSdkPath,
          error: "This publisher portal session cannot access backoffice APIs",
        },
      ].filter((portal) => portal.held);

      if (!heldPortals.some((portal) => portal.allows(requestPath))) {
        // A single-portal session keeps its own message.
        const onlyPortal =
          heldPortals.length === 1 ? heldPortals[0] : undefined;
        return reply.status(403).send({
          error:
            onlyPortal?.error ??
            "This portal session cannot access backoffice APIs",
        });
      }
    }

    // Attach decoded claims to request for downstream route handlers
    request.user = decodedClaims;
    request.adminContext = adminContext;

    // Project-level access enforcement for /gym/* routes (per D-13)
    // Decide on the route Fastify MATCHED, not the raw URL: the router
    // percent-decodes, so `/%67ym/members` runs the /gym/members handler while
    // `request.url` doesn't start with "/gym" — that skipped this gate (#451).
    const matchedPath = request.routeOptions?.url ?? requestPath;
    if (
      matchedPath === "/gym" ||
      matchedPath.startsWith("/gym/") ||
      requestPath === "/gym" ||
      requestPath.startsWith("/gym/")
    ) {
      const hasGymAccess = adminContext.projectAccess.includes("pocket-gyms");
      if (!hasGymAccess) {
        return reply
          .status(403)
          .send({ error: "No access to pocket-gyms project" });
      }
    }
  } catch {
    return reply.status(401).send({ error: "Invalid or expired session" });
  }
}
