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

// Routes exempt from session cookie auth
const PUBLIC_PATHS = new Set(["/health", "/auth/login", "/auth/logout"]);

export async function buildServer() {
  const fastify = Fastify({ logger: true }).withTypeProvider<ZodTypeProvider>();

  fastify.setValidatorCompiler(validatorCompiler);
  fastify.setSerializerCompiler(serializerCompiler);

  // Plugins — register before routes
  await fastify.register(cookie);
  await fastify.register(cors, {
    origin: ENV.BACKOFFICE_ORIGIN,
    credentials: true,
    methods: ["GET", "HEAD", "POST", "PUT", "DELETE"],
  });
  await fastify.register(helmet);

  // Global auth hook — runs before every route handler
  fastify.addHook("onRequest", async (request, reply) => {
    if (PUBLIC_PATHS.has(request.url)) return;
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

start().catch((err) => {
  console.error(err);
  process.exit(1);
});
