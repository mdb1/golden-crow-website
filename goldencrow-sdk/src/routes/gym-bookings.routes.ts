import { FastifyInstance } from "fastify";
import { z } from "zod";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { isAdminRepositoryError } from "../repositories/admin-errors.js";
import {
  createBookingSlot,
  deleteBookingSlot,
  getBooking,
  getBookingSlot,
  listBookingSlots,
  listBookings,
  updateBookingSlot,
  updateBookingStatus,
} from "../repositories/gym-bookings.repository.js";

export async function gymBookingsRoutes(fastify: FastifyInstance): Promise<void> {
  const f = fastify.withTypeProvider<ZodTypeProvider>();

  // --- Booking Slots (GSDK-09, GSDK-10) ---

  f.get("/booking-slots", async (request, reply) => {
    if (!request.adminContext) {
      return reply.status(401).send({ error: "No authenticated admin context" });
    }

    try {
      const slots = await listBookingSlots();
      return reply.send({ slots });
    } catch (error) {
      if (isAdminRepositoryError(error)) {
        return reply.status(error.statusCode).send({ error: error.message });
      }
      throw error;
    }
  });

  f.post(
    "/booking-slots",
    {
      schema: {
        body: z.object({
          date: z.string(),
          startTime: z.string(),
          endTime: z.string(),
          type: z.enum(["class", "session"]),
          title: z.string().min(1),
          maxCapacity: z.number().int().min(1),
          trainerId: z.string().optional(),
        }),
      },
    },
    async (request, reply) => {
      if (!request.adminContext) {
        return reply.status(401).send({ error: "No authenticated admin context" });
      }

      try {
        const slot = await createBookingSlot(request.body);
        return reply.send({ slot });
      } catch (error) {
        if (isAdminRepositoryError(error)) {
          return reply.status(error.statusCode).send({ error: error.message });
        }
        throw error;
      }
    }
  );

  f.get(
    "/booking-slots/:slotId",
    {
      schema: {
        params: z.object({
          slotId: z.string().min(1),
        }),
      },
    },
    async (request, reply) => {
      if (!request.adminContext) {
        return reply.status(401).send({ error: "No authenticated admin context" });
      }

      try {
        const slot = await getBookingSlot(request.params.slotId);
        return reply.send({ slot });
      } catch (error) {
        if (isAdminRepositoryError(error)) {
          return reply.status(error.statusCode).send({ error: error.message });
        }
        throw error;
      }
    }
  );

  f.put(
    "/booking-slots/:slotId",
    {
      schema: {
        params: z.object({
          slotId: z.string().min(1),
        }),
        body: z.object({
          date: z.string().optional(),
          startTime: z.string().optional(),
          endTime: z.string().optional(),
          type: z.enum(["class", "session"]).optional(),
          title: z.string().min(1).optional(),
          maxCapacity: z.number().int().min(1).optional(),
          trainerId: z.string().optional(),
        }),
      },
    },
    async (request, reply) => {
      if (!request.adminContext) {
        return reply.status(401).send({ error: "No authenticated admin context" });
      }

      try {
        const slot = await updateBookingSlot(request.params.slotId, request.body);
        return reply.send({ slot });
      } catch (error) {
        if (isAdminRepositoryError(error)) {
          return reply.status(error.statusCode).send({ error: error.message });
        }
        throw error;
      }
    }
  );

  f.delete(
    "/booking-slots/:slotId",
    {
      schema: {
        params: z.object({
          slotId: z.string().min(1),
        }),
      },
    },
    async (request, reply) => {
      if (!request.adminContext) {
        return reply.status(401).send({ error: "No authenticated admin context" });
      }

      try {
        const result = await deleteBookingSlot(request.params.slotId);
        return reply.send(result);
      } catch (error) {
        if (isAdminRepositoryError(error)) {
          return reply.status(error.statusCode).send({ error: error.message });
        }
        throw error;
      }
    }
  );

  // --- Bookings (GSDK-11) ---

  f.get(
    "/bookings",
    {
      schema: {
        querystring: z.object({
          userId: z.string().optional(),
          status: z.enum(["confirmed", "cancelled"]).optional(),
          from: z.string().optional(),
          to: z.string().optional(),
        }),
      },
    },
    async (request, reply) => {
      if (!request.adminContext) {
        return reply.status(401).send({ error: "No authenticated admin context" });
      }

      try {
        const bookings = await listBookings(request.query);
        return reply.send({ bookings });
      } catch (error) {
        if (isAdminRepositoryError(error)) {
          return reply.status(error.statusCode).send({ error: error.message });
        }
        throw error;
      }
    }
  );

  f.get(
    "/bookings/:bookingId",
    {
      schema: {
        params: z.object({
          bookingId: z.string().min(1),
        }),
      },
    },
    async (request, reply) => {
      if (!request.adminContext) {
        return reply.status(401).send({ error: "No authenticated admin context" });
      }

      try {
        const booking = await getBooking(request.params.bookingId);
        return reply.send({ booking });
      } catch (error) {
        if (isAdminRepositoryError(error)) {
          return reply.status(error.statusCode).send({ error: error.message });
        }
        throw error;
      }
    }
  );

  f.put(
    "/bookings/:bookingId",
    {
      schema: {
        params: z.object({
          bookingId: z.string().min(1),
        }),
        body: z.object({
          status: z.enum(["confirmed", "cancelled"]),
        }),
      },
    },
    async (request, reply) => {
      if (!request.adminContext) {
        return reply.status(401).send({ error: "No authenticated admin context" });
      }

      try {
        const booking = await updateBookingStatus(
          request.params.bookingId,
          request.body.status
        );
        return reply.send({ booking });
      } catch (error) {
        if (isAdminRepositoryError(error)) {
          return reply.status(error.statusCode).send({ error: error.message });
        }
        throw error;
      }
    }
  );
}
