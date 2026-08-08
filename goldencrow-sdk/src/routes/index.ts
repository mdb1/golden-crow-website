import { FastifyInstance } from "fastify";
import { healthRoutes } from "./health.routes.js";
import { authRoutes } from "./auth.routes.js";
import { userRoutes } from "./users.routes.js";
import { reportRoutes } from "./reports.routes.js";
import { communityRoutes } from "./community.routes.js";
import { progressRoutes } from "./progress.routes.js";
import { statsRoutes } from "./stats.routes.js";
import { lessonRoutes } from "./lessons.routes.js";
import { moderationRoutes } from "./moderation.routes.js";
import { areasRoutes } from "./areas.routes.js";
import { rolesRoutes } from "./roles.routes.js";
import { twoPQRoutes } from "./two-pq.routes.js";
import { gymRoutes } from "./gym-index.routes.js";
import { fileStorageRoutes } from "./file-storage.routes.js";
import { discoverRoutes } from "./discover.routes.js";
import { clientBookingsRoutes } from "./client-bookings.routes.js";

export async function registerRoutes(fastify: FastifyInstance): Promise<void> {
  await fastify.register(healthRoutes);
  await fastify.register(authRoutes);
  await fastify.register(areasRoutes);
  await fastify.register(twoPQRoutes);
  await fastify.register(rolesRoutes);
  await fastify.register(userRoutes);
  await fastify.register(reportRoutes);
  await fastify.register(communityRoutes, { prefix: "/community" });
  await fastify.register(progressRoutes);
  await fastify.register(statsRoutes);
  await fastify.register(lessonRoutes);
  await fastify.register(moderationRoutes);
  await fastify.register(fileStorageRoutes);
  await fastify.register(discoverRoutes);
  await fastify.register(clientBookingsRoutes);
  await fastify.register(gymRoutes, { prefix: "/gym" });
}
