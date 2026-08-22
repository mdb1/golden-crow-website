import "dotenv/config";
import Fastify from "fastify";
import { ENV } from "./config/env.js";
import { buildOpenApiDocument } from "./openapi/document.js";
import { reportingRoutes } from "./routes/reporting.routes.js";

export async function buildServer() {
  const fastify = Fastify({ logger: true });

  fastify.get("/health", async () => ({
    status: "ok",
    service: "goldencrow-openapi",
  }));

  fastify.get("/openapi.json", async () =>
    buildOpenApiDocument(ENV.GOLDENCROW_OPENAPI_PUBLIC_URL),
  );

  await fastify.register(reportingRoutes);

  return fastify;
}

async function start() {
  const server = await buildServer();
  await server.listen({ port: ENV.PORT, host: "0.0.0.0" });
}

const isDirectRun =
  process.argv[1]?.endsWith("server.js") ||
  process.argv[1]?.endsWith("server.ts");

if (isDirectRun) {
  start().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
