import { FastifyInstance } from "fastify";
import { z } from "zod";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { isAdminRepositoryError } from "../repositories/admin-errors.js";
import {
  acknowledgeClientBooking,
  archiveClientBooking,
  createClientBooking,
  listClientBookingsForCalendarMonth,
  listClientBookingsPage,
  recordClientBookingRelayhookNotification,
  type ClientBookingRelayhookNotification,
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
    date: z
      .string()
      .trim()
      .regex(/^\d{4}-\d{2}-\d{2}$/),
    startTime: z
      .string()
      .trim()
      .regex(/^\d{2}:\d{2}$/),
    endTime: z
      .string()
      .trim()
      .regex(/^\d{2}:\d{2}$/),
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
  ack: z.enum(["true", "false"]).optional(),
  archived: z.enum(["true", "false"]).optional(),
  month: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}$/)
    .optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
  cursor: z.string().trim().datetime().optional(),
});

const ClientBookingParamsSchema = z.object({
  bookingId: z.string().trim().min(1),
});

type BookingRequest = z.infer<typeof BookingRequestSchema>;

function appendRelayhookParam(
  params: URLSearchParams,
  key: string,
  value: string | number | undefined,
) {
  if (value === undefined) {
    return;
  }

  const normalized = String(value).trim();
  if (normalized) {
    params.set(key, normalized);
  }
}

function getRelayhookUrl(bookingId: string, booking: BookingRequest) {
  const url = new URL(CLIENT_BOOKING_RELAYHOOK_URL);
  const { searchParams } = url;

  appendRelayhookParam(searchParams, "type", "client_booking_created");
  appendRelayhookParam(searchParams, "booking_id", bookingId);
  appendRelayhookParam(searchParams, "event_title", booking.event.title);
  appendRelayhookParam(searchParams, "event_date", booking.event.date);
  appendRelayhookParam(
    searchParams,
    "event_start_time",
    booking.event.startTime,
  );
  appendRelayhookParam(searchParams, "event_end_time", booking.event.endTime);
  appendRelayhookParam(searchParams, "event_starts_at", booking.event.startsAt);
  appendRelayhookParam(searchParams, "event_ends_at", booking.event.endsAt);
  appendRelayhookParam(searchParams, "event_timezone", booking.event.timezone);
  appendRelayhookParam(
    searchParams,
    "event_timezone_label",
    booking.event.timezoneLabel,
  );
  appendRelayhookParam(
    searchParams,
    "duration_minutes",
    booking.event.durationMinutes,
  );
  appendRelayhookParam(searchParams, "full_name", booking.form.fullName);
  appendRelayhookParam(searchParams, "email", booking.form.email);
  appendRelayhookParam(searchParams, "whatsapp", booking.form.whatsapp);
  appendRelayhookParam(searchParams, "company_name", booking.form.companyName);
  appendRelayhookParam(searchParams, "source_context", booking.source.context);
  appendRelayhookParam(searchParams, "source_locale", booking.source.locale);
  appendRelayhookParam(searchParams, "source_page_url", booking.source.pageUrl);
  appendRelayhookParam(searchParams, "source_path", booking.source.path);
  appendRelayhookParam(
    searchParams,
    "source_referrer",
    booking.source.referrer,
  );
  appendRelayhookParam(searchParams, "sent_at", new Date().toISOString());

  return url;
}

async function fetchRelayhook(url: URL) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    return await fetch(url, {
      method: "GET",
      headers: {
        accept: "application/json, text/plain, */*",
      },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function notifyClientBookingWebhook(
  bookingId: string,
  booking: BookingRequest,
  fastify: FastifyInstance,
): Promise<ClientBookingRelayhookNotification> {
  try {
    const response = await fetchRelayhook(getRelayhookUrl(bookingId, booking));

    if (!response.ok) {
      fastify.log.warn(
        { bookingId, statusCode: response.status },
        "Client booking RelayHook notification returned a non-OK response",
      );

      return {
        status: "failed",
        method: "GET",
        statusCode: response.status,
        statusText: response.statusText,
      };
    }

    return {
      status: "delivered",
      method: "GET",
      statusCode: response.status,
      statusText: response.statusText,
    };
  } catch (error) {
    fastify.log.warn(
      { bookingId, error },
      "Client booking RelayHook notification failed",
    );

    return {
      status: "failed",
      method: "GET",
      error: error instanceof Error ? error.message : "Unknown RelayHook error",
    };
  }
}

export async function clientBookingsRoutes(
  fastify: FastifyInstance,
): Promise<void> {
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
        return reply
          .status(401)
          .send({ error: "No authenticated admin context" });
      }

      if (!request.adminContext.isBootstrap) {
        return reply.status(403).send({ error: "GOD MODE access required" });
      }

      if (request.query.view === "calendar") {
        const today = new Date();
        const fallbackMonth = `${today.getUTCFullYear()}-${String(
          today.getUTCMonth() + 1,
        ).padStart(2, "0")}`;
        const result = await listClientBookingsForCalendarMonth({
          month: request.query.month ?? fallbackMonth,
          limit: request.query.limit,
          archived:
            request.query.archived === undefined
              ? false
              : request.query.archived === "true",
        });

        return reply.send(result);
      }

      const result = await listClientBookingsPage({
        limit: request.query.limit,
        cursor: request.query.cursor,
        ack:
          request.query.ack === undefined
            ? undefined
            : request.query.ack === "true",
        archived:
          request.query.archived === undefined
            ? false
            : request.query.archived === "true",
      });

      return reply.send(result);
    },
  );

  f.patch(
    "/admin/client-bookings/:bookingId/ack",
    {
      schema: {
        params: ClientBookingParamsSchema,
        body: z
          .object({
            ack: z.literal(true).default(true),
          })
          .default({ ack: true }),
      },
    },
    async (request, reply) => {
      if (!request.adminContext) {
        return reply
          .status(401)
          .send({ error: "No authenticated admin context" });
      }

      if (!request.adminContext.isBootstrap) {
        return reply.status(403).send({ error: "GOD MODE access required" });
      }

      try {
        const booking = await acknowledgeClientBooking(
          request.params.bookingId,
          request.adminContext.email,
        );
        return reply.send({ booking });
      } catch (error) {
        if (isAdminRepositoryError(error)) {
          return reply.status(error.statusCode).send({ error: error.message });
        }

        throw error;
      }
    },
  );

  f.patch(
    "/admin/client-bookings/:bookingId/archive",
    {
      schema: {
        params: ClientBookingParamsSchema,
        body: z
          .object({
            archived: z.literal(true).default(true),
          })
          .default({ archived: true }),
      },
    },
    async (request, reply) => {
      if (!request.adminContext) {
        return reply
          .status(401)
          .send({ error: "No authenticated admin context" });
      }

      if (!request.adminContext.isBootstrap) {
        return reply.status(403).send({ error: "GOD MODE access required" });
      }

      try {
        const booking = await archiveClientBooking(
          request.params.bookingId,
          request.adminContext.email,
        );
        return reply.send({ booking });
      } catch (error) {
        if (isAdminRepositoryError(error)) {
          return reply.status(error.statusCode).send({ error: error.message });
        }

        throw error;
      }
    },
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
      const notification = await notifyClientBookingWebhook(
        result.id,
        request.body,
        fastify,
      );

      try {
        await recordClientBookingRelayhookNotification(result.id, notification);
      } catch (error) {
        fastify.log.warn(
          { bookingId: result.id, error },
          "Client booking RelayHook notification status could not be recorded",
        );
      }

      if (notification.status !== "delivered") {
        return reply.status(502).send({
          error: "Booking was stored, but RelayHook notification failed",
          status: "notification_failed",
          bookingId: result.id,
          notification,
        });
      }

      return reply.status(201).send({
        status: "ok",
        bookingId: result.id,
        notification,
      });
    },
  );
}
