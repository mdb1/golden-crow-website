import { FastifyInstance } from "fastify";
import { gymMembersRoutes } from "./gym-members.routes.js";
import { gymTrainingRoutes } from "./gym-training.routes.js";
import { gymEvaluationsRoutes } from "./gym-evaluations.routes.js";
import { gymBookingsRoutes } from "./gym-bookings.routes.js";
import { gymNutritionRoutes } from "./gym-nutrition.routes.js";
import { gymClinicalRoutes } from "./gym-clinical.routes.js";
import { gymWorkoutSessionsRoutes } from "./gym-workout-sessions.routes.js";
import { gymMealComplianceRoutes } from "./gym-meal-compliance.routes.js";
import { gymAchievementsRoutes } from "./gym-achievements.routes.js";
import { gymChallengesRoutes } from "./gym-challenges.routes.js";
import { gymStatsRoutes } from "./gym-stats.routes.js";
import { gymDocumentsRoutes } from "./gym-documents.routes.js";
import { gymUserAchievementsRoutes } from "./gym-user-achievements.routes.js";

/**
 * Barrel for all Pocket Gyms routes.
 * Registered under /gym prefix by routes/index.ts.
 */
export async function gymRoutes(fastify: FastifyInstance): Promise<void> {
  await fastify.register(gymMembersRoutes);
  await fastify.register(gymTrainingRoutes);
  await fastify.register(gymEvaluationsRoutes);
  await fastify.register(gymBookingsRoutes);
  await fastify.register(gymNutritionRoutes);
  await fastify.register(gymClinicalRoutes);
  await fastify.register(gymWorkoutSessionsRoutes);
  await fastify.register(gymMealComplianceRoutes);
  await fastify.register(gymAchievementsRoutes);
  await fastify.register(gymChallengesRoutes);
  await fastify.register(gymStatsRoutes);
  await fastify.register(gymDocumentsRoutes);
  await fastify.register(gymUserAchievementsRoutes);
}
