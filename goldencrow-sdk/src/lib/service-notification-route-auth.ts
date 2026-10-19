import type { FastifyReply, FastifyRequest } from "fastify";
import {
  isServiceNotificationTokenError,
  verifyServiceNotificationAccessToken,
} from "./service-notification-access-token.js";

function bearerTokenFromRequest(request: FastifyRequest): string | null {
  const headerValue = request.headers.authorization;
  const value = Array.isArray(headerValue) ? headerValue[0] : headerValue;
  const match = value?.match(/^Bearer\s+([^\s]+)\s*$/i);
  return match?.[1] ?? null;
}

/**
 * Route-level authentication for the two native notification commands.
 *
 * The access token is verified locally, including its signature, expiry,
 * audience, token use, and scope. This hook intentionally performs no
 * Firebase or Firestore operation.
 */
export async function requireServiceNotificationAccessToken(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const token = bearerTokenFromRequest(request);
  if (!token) {
    reply
      .status(401)
      .send({ error: "Missing service notification access token." });
    return;
  }

  try {
    verifyServiceNotificationAccessToken(token);
  } catch (error) {
    if (!isServiceNotificationTokenError(error)) {
      throw error;
    }

    if (error.statusCode === 403) {
      reply.status(403).send({
        error: "Service notification access token scope is insufficient.",
      });
      return;
    }

    if (error.statusCode === 401) {
      reply
        .status(401)
        .send({ error: "Invalid service notification access token." });
      return;
    }

    request.log.error(
      { err: error },
      "Service notification access-token verification is unavailable.",
    );
    reply.status(500).send({
      error: "Service notification authentication is unavailable.",
    });
  }
}
