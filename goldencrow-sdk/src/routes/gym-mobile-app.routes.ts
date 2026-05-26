import { FastifyInstance } from "fastify";
import { z } from "zod";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import {
  getPocketGymMobileAppOverview,
  updatePocketGymAppointmentStatus,
} from "../repositories/gym-mobile-app.repository.js";

const AppointmentStatusSchema = z.enum([
  "pending",
  "accepted",
  "declined",
  "cancelled",
  "completed",
]);

export async function gymMobileAppRoutes(
  fastify: FastifyInstance
): Promise<void> {
  const f = fastify.withTypeProvider<ZodTypeProvider>();

  f.get("/mobile-app", async (request, reply) => {
    if (!request.adminContext) {
      return reply.status(401).send({ error: "No authenticated admin context" });
    }

    const overview = await getPocketGymMobileAppOverview();
    return reply.send(overview);
  });

  f.patch(
    "/mobile-app/appointments/:appointmentId/status",
    {
      schema: {
        params: z.object({
          appointmentId: z.string().min(1),
        }),
        body: z.object({
          status: AppointmentStatusSchema,
        }),
      },
    },
    async (request, reply) => {
      if (!request.adminContext) {
        return reply.status(401).send({ error: "No authenticated admin context" });
      }

      const appointment = await updatePocketGymAppointmentStatus(
        request.params.appointmentId,
        request.body.status
      );

      if (!appointment) {
        return reply.status(404).send({ error: "Appointment not found" });
      }

      return reply.send({ appointment });
    }
  );
}
