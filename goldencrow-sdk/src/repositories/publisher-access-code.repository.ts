import { adminAuthFor, adminDbFor } from "../config/firebase.js";
import type { AdminContext } from "../types/sdk.types.js";
import type { Partner } from "../contracts/connected-partners.js";
import {
  createPublisherAccessCode,
  readPublisherAccessCode,
  type PublisherAccessCodeIdentity,
} from "../lib/publisher-access-code.js";
import { AdminRepositoryError } from "./admin-errors.js";

async function publisherIdentity(
  email: string,
): Promise<PublisherAccessCodeIdentity | null> {
  const role = await adminDbFor("mydnamap")
    .collection("user_roles")
    .doc(email)
    .get();
  const data = role.data();
  if (
    !role.exists ||
    data?.isActive !== true ||
    (data.role !== "organization_publisher" &&
      data.role !== "individual_publisher")
  )
    return null;
  const publisherKind =
    data.role === "organization_publisher" ? "organization" : "individual";
  const publisherId =
    data[publisherKind === "organization" ? "organizationId" : "individualId"];
  if (
    typeof publisherId !== "string" ||
    !publisherId.trim() ||
    publisherId.includes("/") ||
    publisherId.length > 300
  )
    return null;
  const publisher = await adminDbFor("mydnamap")
    .collection(
      publisherKind === "organization"
        ? "feed_organizations"
        : "feed_individuals",
    )
    .doc(publisherId)
    .get();
  if (!publisher.exists) return null;
  let user;
  try {
    user = await adminAuthFor("mydnamap").getUserByEmail(email);
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "auth/user-not-found"
    )
      return null;
    throw error;
  }
  if (
    user.disabled ||
    user.email?.trim().toLowerCase() !== email ||
    (data.firebaseUid && data.firebaseUid !== user.uid)
  )
    return null;
  return {
    email,
    uid: user.uid,
    publisherKind,
    publisherId,
    authValidAfter: user.tokensValidAfterTime ?? "",
  };
}

export async function partnerPublisherAccessCode(
  context: AdminContext,
  partner: Partner,
) {
  if (!context.isBootstrap)
    throw new AdminRepositoryError("GOD MODE access required", 403);
  if (!partner.linkedOrganizationId && !partner.linkedIndividualPublisherId)
    return null;
  const identity = await publisherIdentity(partner.email.trim().toLowerCase());
  if (!identity) return null;
  const expectedId = partner.linkedApp
    ? partner.linkedApp.publisherKind === identity.publisherKind
      ? partner.linkedApp.publisherId
      : null
    : identity.publisherKind === "organization"
      ? partner.linkedOrganizationId
      : partner.linkedIndividualPublisherId;
  if (identity.publisherId !== expectedId) return null;
  return createPublisherAccessCode(identity, partner.id);
}

export async function exchangePublisherAccessCode(
  email: string,
  accessKey: string,
) {
  const normalizedEmail = email.trim().toLowerCase();
  const payload = readPublisherAccessCode(accessKey, normalizedEmail);
  const current = await publisherIdentity(normalizedEmail);
  if (
    !current ||
    current.uid !== payload.uid ||
    current.publisherKind !== payload.publisherKind ||
    current.publisherId !== payload.publisherId ||
    current.authValidAfter !== payload.authValidAfter
  ) {
    throw new AdminRepositoryError(
      "This access link is invalid or expired. Request a new email or use your usual access key.",
      401,
    );
  }
  return {
    customToken: await adminAuthFor("mydnamap").createCustomToken(current.uid),
  };
}
