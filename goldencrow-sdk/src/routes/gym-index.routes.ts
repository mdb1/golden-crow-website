import { FastifyInstance } from "fastify";
import { gymMembersRoutes } from "./gym-members.routes.js";
import { gymTrainingRoutes } from "./gym-training.routes.js";
import { gymEvaluationsRoutes } from "./gym-evaluations.routes.js";
import { gymBookingsRoutes } from "./gym-bookings.routes.js";
import { gymNutritionRoutes } from "./gym-nutrition.routes.js";
import { gymClinicalRoutes } from "./gym-clinical.routes.js";

/**
 * Barrel for all Pocket Gyms routes.
 * Registered under /gym prefix by routes/index.ts.
 * Sub-routes added by plans 02-02 through 02-06.
 */
export async function gymRoutes(fastify: FastifyInstance): Promise<void> {
  await fastify.register(gymMembersRoutes);
  await fastify.register(gymTrainingRoutes);
  await fastify.register(gymEvaluationsRoutes);
  await fastify.register(gymBookingsRoutes);
  await fastify.register(gymNutritionRoutes);
  await fastify.register(gymClinicalRoutes);

  // Sub-route registrations added as plans 02-05 through 02-06 complete:
  // await fastify.register(gymStatsRoutes);
  // await fastify.register(gymAchievementsRoutes);
  // await fastify.register(gymChallengesRoutes);
}
