/**
 * Service-transaction notification rollout switch.
 *
 * Keep this as the only production activation point. `false` preserves the
 * temporary operations recipient; changing this single value to `true` routes
 * notifications to the live provider `contactEmail` supplied by the
 * repository. Follow the production checklist in
 * `goldencrow-sdk/docs/service-transaction-provider-recipient-cutover.md`.
 */
export const SEND_SERVICE_TRANSACTION_NOTIFICATIONS_TO_PROVIDER = false;

const TEMPORARY_OPERATIONS_RECIPIENT_EMAIL = "federico@goldencrowvs.com";
const SERVICE_TRANSACTION_BACKOFFICE_PATH = "/god-mode/service-transactions";
const SERVICE_TRANSACTION_PUBLISHER_PORTAL_PATH =
  "/publisher-portal/service-transactions";
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type ServiceTransactionNotificationRecipientMode =
  | "temporary_operations"
  | "provider";

export type ServiceTransactionNotificationRouting = {
  recipientMode: ServiceTransactionNotificationRecipientMode;
  recipientEmail: string;
  greeting: string;
  destinationPath: string;
  destinationTextLabel: string;
  destinationButtonLabel: string;
};

export class ServiceTransactionNotificationRoutingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ServiceTransactionNotificationRoutingError";
  }
}

function normalizedProviderContactEmail(value: unknown) {
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.trim().toLowerCase();
  return normalized || undefined;
}

/**
 * The optional mode argument exists so both routes can be tested without
 * changing the production switch. Production callers must omit it.
 */
export function resolveServiceTransactionNotificationRouting(
  providerContactEmail: unknown,
  sendToProvider = SEND_SERVICE_TRANSACTION_NOTIFICATIONS_TO_PROVIDER,
): ServiceTransactionNotificationRouting {
  if (!sendToProvider) {
    return {
      recipientMode: "temporary_operations",
      recipientEmail: TEMPORARY_OPERATIONS_RECIPIENT_EMAIL,
      greeting: "Hello Federico,",
      destinationPath: SERVICE_TRANSACTION_BACKOFFICE_PATH,
      destinationTextLabel: "Review it in the backoffice",
      destinationButtonLabel: "Review in backoffice",
    };
  }

  const recipientEmail = normalizedProviderContactEmail(providerContactEmail);
  if (
    !recipientEmail ||
    recipientEmail.length > 320 ||
    !EMAIL_PATTERN.test(recipientEmail)
  ) {
    throw new ServiceTransactionNotificationRoutingError(
      "The live service provider must have a valid contactEmail before provider notification routing can be enabled.",
    );
  }

  return {
    recipientMode: "provider",
    recipientEmail,
    greeting: "Hello,",
    destinationPath: SERVICE_TRANSACTION_PUBLISHER_PORTAL_PATH,
    destinationTextLabel: "Review it in the publisher portal",
    destinationButtonLabel: "Review in publisher portal",
  };
}
