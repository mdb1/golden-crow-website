import { FastifyInstance } from "fastify";
import { z } from "zod";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { createClientBooking } from "../repositories/client-bookings.repository.js";

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
    identification: z.string().trim().min(1).max(120),
    investmentReadiness: z.string().trim().min(1).max(180),
    message: z.string().trim().max(1200).optional().default(""),
  }),
});

export async function clientBookingsRoutes(fastify: FastifyInstance): Promise<void> {
  const f = fastify.withTypeProvider<ZodTypeProvider>();

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

      return reply.status(201).send({
        status: "ok",
        bookingId: result.id,
      });
    }
  );
}
