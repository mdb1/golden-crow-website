import { FastifyInstance } from "fastify";
import { z } from "zod";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { isAdminRepositoryError } from "../repositories/admin-errors.js";
import {
  acknowledgeClientBooking,
  archiveClientBooking,
  convertClientBookingToGoogleCalendar,
  createClientBooking,
  getPublisherBookingContact,
  listClientBookingAvailability,
  listClientBookingsForCalendarMonth,
  listClientBookingsPage,
  listPublisherBookingsPage,
  publisherBookingScope,
  recordClientBookingEmailNotification,
  recordClientBookingWebhookNotification,
  type ClientBookingEmailNotification,
  type ClientBookingInput,
  type ClientBookingWebhookNotification,
} from "../repositories/client-bookings.repository.js";
import { ENV } from "../config/env.js";
import { buildClientBookingEmails } from "../lib/client-booking-email.js";
import { ClientBookingGoogleCalendarError } from "../lib/client-booking-google-calendar.js";
import {
  bookingLanguage,
  clientBookingSlotEvent,
  isClientBookingDateAvailable,
  isSupportBookingReason,
  SUPPORT_BOOKING_CONTEXT,
  type SupportBookingReason,
} from "../lib/client-booking-schedule.js";
import { GmailDeliveryOutcomeUnknownError, sendGmailMessage } from "../lib/gmail-mailer.js";

const OptionalUrlSchema = z
  .string()
  .trim()
  .url()
  .max(1000)
  // Rendered as a link in the GOD MODE inbox: only web URLs, never
  // javascript:/data: from this public form (#451).
  .refine((value) => /^https?:\/\//i.test(value), "Must be an http(s) URL")
  .optional()
  .or(z.literal("").transform(() => undefined));

const BookingLocaleSchema = z.string().trim().min(2).max(10);
const BookingDateSchema = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/);
const BookingTimeSchema = z.string().trim().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);
const BookingEmailSchema = z.string().trim().toLowerCase().email().max(180);
const BookingWhatsAppSchema = z.string().trim().min(5).max(50);
const BookingCompanySchema = z.string().trim().max(160);
const BookingMonthSchema = z.string().trim().regex(/^\d{4}-(?:0[1-9]|1[0-2])$/);

const BookingRequestSchema = z.object({
  source: z.object({
    context: z.string().trim().min(1).max(120),
    locale: BookingLocaleSchema,
    pageUrl: OptionalUrlSchema,
    path: z.string().trim().max(400).optional(),
    referrer: OptionalUrlSchema,
  }),
  event: z.object({
    title: z.string().trim().min(1).max(120),
    durationMinutes: z.number().int().min(15).max(120),
    timezone: z.string().trim().min(1).max(80),
    timezoneLabel: z.string().trim().min(1).max(120),
    date: BookingDateSchema,
    startTime: BookingTimeSchema,
    endTime: BookingTimeSchema,
    startsAt: z.string().trim().datetime(),
    endsAt: z.string().trim().datetime(),
  }),
  form: z.object({
    fullName: z.string().trim().min(1).max(120),
    email: BookingEmailSchema,
    whatsapp: BookingWhatsAppSchema,
    companyName: BookingCompanySchema.default(""),
  }),
});

const SupportBookingSlotSchema = z.object({
  date: BookingDateSchema,
  startTime: BookingTimeSchema,
  reason: z.custom<SupportBookingReason>(isSupportBookingReason, "Choose a booking reason"),
  locale: BookingLocaleSchema,
});

const PublicSupportBookingSchema = SupportBookingSlotSchema.extend({
  fullName: z.string().trim().min(1).max(120),
  email: BookingEmailSchema,
  whatsapp: BookingWhatsAppSchema,
  companyName: BookingCompanySchema.default(""),
});

const PublisherSupportBookingSchema = SupportBookingSlotSchema.extend({
  whatsapp: BookingWhatsAppSchema.or(z.literal("")).default(""),
});

const BookingAvailabilityQuerySchema = z.object({
  month: BookingMonthSchema,
  context: z.string().trim().min(1).max(120).default(SUPPORT_BOOKING_CONTEXT),
  path: z.string().trim().max(400).optional(),
});

const PublisherBookingsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  cursor: z.string().regex(/^[A-Za-z0-9_-]{1,100}$/).optional(),
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
  bookingId: z.string().trim().regex(/^[A-Za-z0-9_-]{1,100}$/),
});

function appendWebhookParam(
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

function getBookingWebhookUrl(bookingId: string, booking: ClientBookingInput) {
  if (!ENV.CLIENT_BOOKING_WEBHOOK_URL) {
    return undefined;
  }

  const url = new URL(ENV.CLIENT_BOOKING_WEBHOOK_URL);
  const { searchParams } = url;

  appendWebhookParam(searchParams, "type", "client_booking_created");
  appendWebhookParam(searchParams, "booking_id", bookingId);
  appendWebhookParam(searchParams, "event_title", booking.event.title);
  appendWebhookParam(searchParams, "event_date", booking.event.date);
  appendWebhookParam(
    searchParams,
    "event_start_time",
    booking.event.startTime,
  );
  appendWebhookParam(searchParams, "event_end_time", booking.event.endTime);
  appendWebhookParam(searchParams, "event_starts_at", booking.event.startsAt);
  appendWebhookParam(searchParams, "event_ends_at", booking.event.endsAt);
  appendWebhookParam(searchParams, "event_timezone", booking.event.timezone);
  appendWebhookParam(
    searchParams,
    "event_timezone_label",
    booking.event.timezoneLabel,
  );
  appendWebhookParam(
    searchParams,
    "duration_minutes",
    booking.event.durationMinutes,
  );
  appendWebhookParam(searchParams, "full_name", booking.form.fullName);
  appendWebhookParam(searchParams, "email", booking.form.email);
  appendWebhookParam(searchParams, "whatsapp", booking.form.whatsapp);
  appendWebhookParam(searchParams, "company_name", booking.form.companyName);
  appendWebhookParam(searchParams, "booking_kind", booking.kind);
  appendWebhookParam(searchParams, "reason", booking.reason);
  appendWebhookParam(searchParams, "source_context", booking.source.context);
  appendWebhookParam(searchParams, "source_locale", booking.source.locale);
  appendWebhookParam(searchParams, "source_page_url", booking.source.pageUrl);
  appendWebhookParam(searchParams, "source_path", booking.source.path);
  appendWebhookParam(
    searchParams,
    "source_referrer",
    booking.source.referrer,
  );
  appendWebhookParam(searchParams, "sent_at", new Date().toISOString());

  return url;
}

async function notifyClientBookingEmails(bookingId: string, booking: ClientBookingInput, fastify: FastifyInstance) {
  const deliveries = await Promise.all(buildClientBookingEmails(bookingId, booking).map(async ({ audience, message }) => {
    try {
      await sendGmailMessage(message, { signal: AbortSignal.timeout(10_000) });
      return [audience, "delivered"] as const;
    } catch (error) {
      fastify.log.warn({ bookingId, audience, error }, "Client booking email delivery failed");
      const status = error instanceof GmailDeliveryOutcomeUnknownError ? "unknown" : "failed";
      return [audience, status] as const;
    }
  }));
  try {
    await recordClientBookingEmailNotification(bookingId, Object.fromEntries(deliveries) as ClientBookingEmailNotification);
  } catch (error) {
    fastify.log.warn({ bookingId, error }, "Client booking email status could not be recorded");
  }
}

async function sendClientBookingNotifications(bookingId: string, booking: ClientBookingInput, fastify: FastifyInstance) {
  const [notification] = await Promise.all([
    notifyClientBookingWebhook(bookingId, booking, fastify),
    notifyClientBookingEmails(bookingId, booking, fastify),
  ]);
  try {
    await recordClientBookingWebhookNotification(bookingId, notification);
  } catch (error) {
    fastify.log.warn({ bookingId, error }, "Client booking webhook status could not be recorded");
  }
  return notification;
}

function supportBookingInput(
  slot: z.infer<typeof SupportBookingSlotSchema>,
  form: ClientBookingInput["form"],
  kind: "publisher_support" | "public_support",
): ClientBookingInput {
  const title = bookingLanguage(slot.locale) === "es" ? "Soporte de Pocket Genes" : "Pocket Genes support";
  return {
    kind,
    reason: slot.reason,
    source: {
      context: SUPPORT_BOOKING_CONTEXT,
      locale: slot.locale,
      path: kind === "publisher_support" ? "/publisher-portal/support-bookings/new" : "/pocket-genes/book-with-us",
    },
    event: { title, ...clientBookingSlotEvent(slot.date, slot.startTime) },
    form,
  };
}

async function fetchBookingWebhook(url: URL) {
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
  booking: ClientBookingInput,
  fastify: FastifyInstance,
): Promise<ClientBookingWebhookNotification> {
  try {
    const webhookUrl = getBookingWebhookUrl(bookingId, booking);
    if (!webhookUrl) {
      return { status: "skipped", reason: "not_configured" };
    }

    const response = await fetchBookingWebhook(webhookUrl);

    if (!response.ok) {
      fastify.log.warn(
        { bookingId, statusCode: response.status },
        "Client booking webhook notification returned a non-OK response",
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
      "Client booking webhook notification failed",
    );

    return {
      status: "failed",
      method: "GET",
      error: error instanceof Error ? error.message : "Unknown webhook error",
    };
  }
}

export async function clientBookingsRoutes(
  fastify: FastifyInstance,
): Promise<void> {
  const f = fastify.withTypeProvider<ZodTypeProvider>();

  f.get("/client-bookings/availability", { schema: { querystring: BookingAvailabilityQuerySchema } }, async (request, reply) => {
    const { month, context, path } = request.query;
    try {
      const availability = await listClientBookingAvailability(month, context, path);
      return reply.header("cache-control", "no-store").send(availability);
    } catch (error) {
      if (isAdminRepositoryError(error)) return reply.status(error.statusCode).send({ error: error.message });
      throw error;
    }
  });

  f.get("/admin/publisher-support-bookings", { schema: { querystring: PublisherBookingsQuerySchema } }, async (request, reply) => {
    if (!request.adminContext) return reply.status(401).send({ error: "No authenticated admin context" });
    if (!publisherBookingScope(request.adminContext)) return reply.status(403).send({ error: "Publisher portal access required" });

    try {
      const page = await listPublisherBookingsPage(request.adminContext.uid, request.query);
      return reply.header("cache-control", "no-store").send(page);
    } catch (error) {
      if (isAdminRepositoryError(error)) return reply.status(error.statusCode).send({ error: error.message });
      throw error;
    }
  });

  f.post("/admin/publisher-support-bookings", { schema: { body: PublisherSupportBookingSchema } }, async (request, reply) => {
    if (!request.adminContext) return reply.status(401).send({ error: "No authenticated admin context" });
    if (!publisherBookingScope(request.adminContext)) return reply.status(403).send({ error: "Publisher portal access required" });
    if (!isClientBookingDateAvailable(request.body.date)) return reply.status(409).send({ error: "This slot is unavailable. Choose another time." });

    try {
      const contact = await getPublisherBookingContact(request.adminContext);
      const email = BookingEmailSchema.safeParse(contact.email);
      if (!email.success) return reply.status(422).send({ error: "A valid publisher email is required" });
      const booking = supportBookingInput(request.body, { ...contact, email: email.data, whatsapp: request.body.whatsapp }, "publisher_support");
      const result = await createClientBooking(booking, { publisherUid: request.adminContext.uid, origin: request.headers.origin });
      await sendClientBookingNotifications(result.id, booking, fastify);
      return reply.status(201).send({ status: "ok", bookingId: result.id });
    } catch (error) {
      if (isAdminRepositoryError(error)) return reply.status(error.statusCode).send({ error: error.message });
      throw error;
    }
  });

  f.post("/support-bookings", { schema: { body: PublicSupportBookingSchema } }, async (request, reply) => {
    const { fullName, email, whatsapp, companyName } = request.body;
    if (!isClientBookingDateAvailable(request.body.date)) return reply.status(409).send({ error: "This slot is unavailable. Choose another time." });

    try {
      const booking = supportBookingInput(request.body, { fullName, email, whatsapp, companyName }, "public_support");
      const result = await createClientBooking(booking, { origin: request.headers.origin });
      await sendClientBookingNotifications(result.id, booking, fastify);
      return reply.status(201).send({ status: "ok", bookingId: result.id });
    } catch (error) {
      if (isAdminRepositoryError(error)) return reply.status(error.statusCode).send({ error: error.message });
      throw error;
    }
  });

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

  f.post("/admin/client-bookings/:bookingId/google-calendar", { schema: { params: ClientBookingParamsSchema } }, async (request, reply) => {
    if (!request.adminContext) return reply.status(401).send({ error: "No authenticated admin context" });
    if (!request.adminContext.isBootstrap) return reply.status(403).send({ error: "GOD MODE access required" });

    try {
      const booking = await convertClientBookingToGoogleCalendar(request.params.bookingId);
      return reply.send({ booking });
    } catch (error) {
      if (isAdminRepositoryError(error) || error instanceof ClientBookingGoogleCalendarError) {
        return reply.status(error.statusCode).send({ error: error.message });
      }
      throw error;
    }
  });

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
      try {
        const result = await createClientBooking(request.body, { origin: request.headers.origin });
        const notification = await sendClientBookingNotifications(result.id, {
          ...request.body,
          event: {
            title: request.body.event.title,
            ...clientBookingSlotEvent(request.body.event.date, request.body.event.startTime),
          },
        }, fastify);

        if (notification.status === "failed") {
          const { method, status, statusCode } = notification;
          return reply.status(502).send({
            error: "Booking was stored, but webhook notification failed",
            status: "notification_failed",
            bookingId: result.id,
            notification: { status, method, statusCode },
          });
        }

        return reply.status(201).send({ status: "ok", bookingId: result.id, notification });
      } catch (error) {
        if (isAdminRepositoryError(error)) return reply.status(error.statusCode).send({ error: error.message });
        throw error;
      }
    },
  );
}
