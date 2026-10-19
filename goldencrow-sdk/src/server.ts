// The FastifyRequest augmentation (`user`, `adminContext`). Referenced here, not
// just picked up by tsconfig's `include`, because Vercel type-checks starting
// from api/index.ts — without this line its build sees none of the routes'
// request fields and fails (2026-10-15, after @vercel/node 24).
/// <reference path="./types/fastify.d.ts" />
import "dotenv/config";
import Fastify from "fastify";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import {
  ZodTypeProvider,
  serializerCompiler,
  validatorCompiler,
} from "fastify-type-provider-zod";
import { registerRoutes } from "./routes/index.js";
import { authMiddleware } from "./middleware/auth.js";
import { ENV } from "./config/env.js";
import { nativeServiceTransactionPlatform } from "./lib/service-transaction-owner-notification-contract.js";

// Routes exempt from session cookie auth
const PUBLIC_PATHS = new Set([
  "/health",
  "/client-bookings",
  "/discover/publisher-favicon",
  "/discover/publisher-requests",
  "/auth/login",
  "/auth/logout",
  "/auth/email-signup",
  "/auth/email-signup/eligibility",
  "/service-transactions/notification-token",
  "/service-transactions/notify-requester",
  "/service-transactions/notify-provider",
]);

export function isPublicPath(path: string) {
  const notificationPath = path.match(
    /^\/service-transactions\/([^/]+)\/notify-owner$/,
  );
  return (
    PUBLIC_PATHS.has(path) ||
    (notificationPath !== null &&
      nativeServiceTransactionPlatform(notificationPath[1] ?? "") !== null) ||
    path === "/internal/openapi" ||
    path.startsWith("/internal/openapi/")
  );
}

const CORS_ORIGINS = [
  ENV.BACKOFFICE_ORIGIN,
  "https://goldencrowvs.com",
  "https://www.goldencrowvs.com",
  /^http:\/\/localhost:\d+$/,
  /^http:\/\/127\.0\.0\.1:\d+$/,
];

export interface BuildServerOptions {
  /** Defaults to true; the smoke test and the route-gate test turn it off. */
  logger?: boolean;
  /** Sees every route as it registers — how the tests enumerate the API. */
  onRoute?: (route: { method: string | string[]; url: string }) => void;
}

export async function buildServer(options: BuildServerOptions = {}) {
  const fastify = Fastify({
    logger: options.logger ?? true,
  }).withTypeProvider<ZodTypeProvider>();
  if (options.onRoute) {
    const onRoute = options.onRoute;
    fastify.addHook("onRoute", (route) => onRoute(route));
  }

  fastify.setValidatorCompiler(validatorCompiler);
  fastify.setSerializerCompiler(serializerCompiler);

  // Plugins — register before routes
  await fastify.register(cookie);
  await fastify.register(cors, {
    origin: CORS_ORIGINS,
    credentials: true,
    methods: ["GET", "HEAD", "POST", "PUT", "DELETE", "OPTIONS"],
  });
  await fastify.register(helmet);

  // Global auth hook — runs before every route handler
  fastify.addHook("onRequest", async (request, reply) => {
    const requestPath = request.url.split("?")[0] ?? request.url;
    if (isPublicPath(requestPath)) return;
    await authMiddleware(request, reply);
  });

  // All routes
  await fastify.register(registerRoutes);

  return fastify;
}

async function start() {
  const server = await buildServer();
  await server.listen({ port: ENV.PORT, host: "0.0.0.0" });
}

// Only auto-start when run directly (not when imported by Vercel adapter)
const isDirectRun =
  process.argv[1]?.endsWith("server.js") ||
  process.argv[1]?.endsWith("server.ts");

if (isDirectRun) {
  start().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
