import { FastifyInstance } from "fastify";

/**
 * Barrel for all Pocket Gyms routes.
 * Registered under /gym prefix by routes/index.ts.
 * Sub-routes added by plans 02-02 through 02-06.
 */
export async function gymRoutes(fastify: FastifyInstance): Promise<void> {
  // Sub-route registrations added as plans 02-02 through 02-06 complete:
  // await fastify.register(gymMembersRoutes);
  // await fastify.register(gymTrainingRoutes);
  // await fastify.register(gymEvaluationsRoutes);
  // await fastify.register(gymNutritionRoutes);
  // await fastify.register(gymClinicalRoutes);
  // await fastify.register(gymBookingsRoutes);
  // await fastify.register(gymStatsRoutes);
  // await fastify.register(gymAchievementsRoutes);
  // await fastify.register(gymChallengesRoutes);
}
