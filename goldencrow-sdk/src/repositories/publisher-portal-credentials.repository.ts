import { FieldValue } from "firebase-admin/firestore";
import { adminDbFor } from "../config/firebase.js";
import type { AdminContext } from "../types/sdk.types.js";
import type { Partner } from "../contracts/connected-partners.js";
import { AdminRepositoryError } from "./admin-errors.js";
import {
  PUBLISHER_ACCESS_KEY_FIELD,
  openPublisherAccessKey,
  sealPublisherAccessKey,
  type PublisherCredentialKind,
} from "../lib/publisher-portal-credentials.js";

function requireGodMode(context: AdminContext) {
  if (!context.isBootstrap)
    throw new AdminRepositoryError("GOD MODE access required", 403);
}

function publisherRef(kind: PublisherCredentialKind, id: string) {
  return adminDbFor("mydnamap")
    .collection(
      kind === "organization" ? "feed_organizations" : "feed_individuals",
    )
    .doc(id);
}

export async function publisherAccessKeyStatus(
  context: AdminContext,
  kind: PublisherCredentialKind,
  id: string,
) {
  requireGodMode(context);
  const snapshot = await publisherRef(kind, id).get();
  if (!snapshot.exists)
    throw new AdminRepositoryError("Publisher not found.", 404);
  const data = snapshot.data()!;
  return {
    available: data[PUBLISHER_ACCESS_KEY_FIELD] != null,
    contactEmail:
      typeof data.contactEmail === "string" ? data.contactEmail : null,
  };
}

export async function revealPublisherAccessKey(
  context: AdminContext,
  kind: PublisherCredentialKind,
  id: string,
) {
  requireGodMode(context);
  const snapshot = await publisherRef(kind, id).get();
  if (!snapshot.exists)
    throw new AdminRepositoryError("Publisher not found.", 404);
  const credential = openPublisherAccessKey(
    kind,
    id,
    snapshot.data()?.[PUBLISHER_ACCESS_KEY_FIELD],
  );
  if (!credential)
    throw new AdminRepositoryError(
      "This publisher does not have a saved access key.",
      404,
    );
  return credential;
}

export async function saveMissingPublisherAccessKey(
  context: AdminContext,
  kind: PublisherCredentialKind,
  id: string,
  accessKey: string,
) {
  requireGodMode(context);
  const ref = publisherRef(kind, id);
  await adminDbFor("mydnamap").runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists)
      throw new AdminRepositoryError("Publisher not found.", 404);
    const data = snapshot.data()!;
    if (data[PUBLISHER_ACCESS_KEY_FIELD] != null)
      throw new AdminRepositoryError(
        "This publisher already has a saved access key. Close and reopen this dialog to reveal it.",
        409,
      );
    if (typeof data.contactEmail !== "string" || !data.contactEmail.trim())
      throw new AdminRepositoryError(
        "Save a contact email for this publisher first.",
        400,
      );
    transaction.update(ref, {
      [PUBLISHER_ACCESS_KEY_FIELD]: sealPublisherAccessKey(
        kind,
        id,
        data.contactEmail,
        accessKey,
      ),
      updatedAt: FieldValue.serverTimestamp(),
      updatedByUserId: context.uid,
    });
  });
  return { available: true };
}

export async function partnerPublisherStoredAccessKey(
  context: AdminContext,
  partner: Partner,
) {
  requireGodMode(context);
  const email = partner.email.trim().toLowerCase();
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
  const kind =
    data.role === "organization_publisher" ? "organization" : "individual";
  const id = data[kind === "organization" ? "organizationId" : "individualId"];
  const expectedId = partner.linkedApp
    ? partner.linkedApp.publisherKind === kind
      ? partner.linkedApp.publisherId
      : null
    : kind === "organization"
      ? partner.linkedOrganizationId
      : partner.linkedIndividualPublisherId;
  if (typeof id !== "string" || !id || id !== expectedId) return null;
  const publisher = await publisherRef(kind, id).get();
  if (!publisher.exists) return null;
  const credential = openPublisherAccessKey(
    kind,
    id,
    publisher.data()?.[PUBLISHER_ACCESS_KEY_FIELD],
  );
  return credential?.email === email ? credential.accessKey : null;
}
