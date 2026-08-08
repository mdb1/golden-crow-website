import { FastifyInstance } from "fastify";
import { z } from "zod";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import {
  createClientBooking,
  listClientBookingsForCalendarMonth,
  listClientBookingsPage,
} from "../repositories/client-bookings.repository.js";

const CLIENT_BOOKING_RELAYHOOK_URL =
  "https://data.relayhook.com/api/data/wh_parent_d9fff58f3852_TmV3IG1lZXRpbmcgdHJhY2tlZA";

const OptionalUrlSchema = z
  .string()
  .trim()
  .url()
  .max(1000)
  .optional()
  .or(z.literal("").transform(() => undefined));

const BookingRequestSchema = z.object({
  source: z.object({
    context: z.string().trim().min(1).max(120),
    locale: z.string().trim().min(2).max(10),
    pageUrl: OptionalUrlSchema,
    path: z.string().trim().max(400).optional(),
    referrer: OptionalUrlSchema,
  }),
  event: z.object({
    title: z.string().trim().min(1).max(120),
    durationMinutes: z.number().int().min(15).max(120),
    timezone: z.string().trim().min(1).max(80),
    timezoneLabel: z.string().trim().min(1).max(120),
    date: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/),
    startTime: z.string().trim().regex(/^\d{2}:\d{2}$/),
    endTime: z.string().trim().regex(/^\d{2}:\d{2}$/),
    startsAt: z.string().trim().datetime(),
    endsAt: z.string().trim().datetime(),
  }),
  form: z.object({
    fullName: z.string().trim().min(1).max(120),
    email: z.string().trim().toLowerCase().email().max(180),
    whatsapp: z.string().trim().min(5).max(50),
    companyName: z.string().trim().min(1).max(160),
  }),
});

const AdminClientBookingsQuerySchema = z.object({
  view: z.enum(["calendar", "list"]).default("list"),
  month: z.string().trim().regex(/^\d{4}-\d{2}$/).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
  cursor: z.string().trim().datetime().optional(),
});

type BookingRequest = z.infer<typeof BookingRequestSchema>;

async function notifyClientBookingWebhook(
  bookingId: string,
  booking: BookingRequest,
  fastify: FastifyInstance
): Promise<void> {
  try {
    const response = await fetch(CLIENT_BOOKING_RELAYHOOK_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        type: "client_booking_created",
        bookingId,
        ...booking,
      }),
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      fastify.log.warn(
        { bookingId, statusCode: response.status },
        "Client booking RelayHook notification returned a non-OK response"
      );
    }
  } catch (error) {
    fastify.log.warn(
      { bookingId, error },
      "Client booking RelayHook notification failed"
    );
  }
}

export async function clientBookingsRoutes(fastify: FastifyInstance): Promise<void> {
  const f = fastify.withTypeProvider<ZodTypeProvider>();

  f.get(
    "/admin/client-bookings",
    {
      schema: {
        querystring: AdminClientBookingsQuerySchema,
      },
    },
    async (request, reply) => {
      if (!request.adminContext) {
        return reply.status(401).send({ error: "No authenticated admin context" });
      }

      if (!request.adminContext.isBootstrap) {
        return reply.status(403).send({ error: "GOD MODE access required" });
      }

      if (request.query.view === "calendar") {
        const today = new Date();
        const fallbackMonth = `${today.getUTCFullYear()}-${String(
          today.getUTCMonth() + 1
        ).padStart(2, "0")}`;
        const result = await listClientBookingsForCalendarMonth({
          month: request.query.month ?? fallbackMonth,
          limit: request.query.limit,
        });

        return reply.send(result);
      }

      const result = await listClientBookingsPage({
        limit: request.query.limit,
        cursor: request.query.cursor,
      });

      return reply.send(result);
    }
  );

  f.post(
    "/client-bookings",
    {
      schema: {
        body: BookingRequestSchema,
      },
    },
    async (request, reply) => {
      const result = await createClientBooking(request.body, {
        origin: request.headers.origin,
      });

      await notifyClientBookingWebhook(result.id, request.body, fastify);

      return reply.status(201).send({
        status: "ok",
        bookingId: result.id,
      });
    }
  );
}
