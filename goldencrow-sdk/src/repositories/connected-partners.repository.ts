import { FieldPath } from "firebase-admin/firestore";
import { adminDbFor } from "../config/firebase.js";
import {
  CONNECTED_PARTNERS_COLLECTION,
  PartnerIdSchema,
  PartnerInputSchema,
  type Partner,
  type PartnerInput,
  type PartnersPage,
} from "../contracts/connected-partners.js";
import type { AdminContext } from "../types/sdk.types.js";
import { AdminRepositoryError } from "./admin-errors.js";

const PAGE_SIZE = 20;

function collection(context: AdminContext) {
  if (!context.isBootstrap) {
    throw new AdminRepositoryError("GOD MODE access required", 403);
  }
  return adminDbFor("mydnamap").collection(CONNECTED_PARTNERS_COLLECTION);
}

function validId(id: string) {
  const result = PartnerIdSchema.safeParse(id);
  if (!result.success)
    throw new AdminRepositoryError("Invalid partner ID", 400);
  return result.data;
}

function toPartner(id: string, data: unknown): Partner {
  return { ...PartnerInputSchema.parse(data), id };
}

export async function listPartners(
  context: AdminContext,
  cursor?: string,
): Promise<PartnersPage> {
  let query = collection(context).orderBy(FieldPath.documentId());
  if (cursor) query = query.startAfter(validId(cursor));
  const snapshot = await query.limit(PAGE_SIZE + 1).get();
  const docs = snapshot.docs.slice(0, PAGE_SIZE);
  return {
    items: docs.map((doc) => toPartner(doc.id, doc.data())),
    nextCursor:
      snapshot.docs.length > PAGE_SIZE ? docs[docs.length - 1]!.id : null,
  };
}

export async function getPartner(
  context: AdminContext,
  id: string,
): Promise<Partner> {
  const doc = await collection(context).doc(validId(id)).get();
  if (!doc.exists) throw new AdminRepositoryError("Partner not found", 404);
  return toPartner(doc.id, doc.data());
}

export async function createPartner(
  context: AdminContext,
  input: PartnerInput,
): Promise<Partner> {
  const partners = collection(context);
  const data = PartnerInputSchema.parse(input);
  const ref = partners.doc();
  await ref.create(data);
  return { ...data, id: ref.id };
}

export async function updatePartner(
  context: AdminContext,
  id: string,
  input: PartnerInput,
): Promise<Partner> {
  const ref = collection(context).doc(validId(id));
  const data = PartnerInputSchema.parse(input);
  // update() preserves the not-found precondition even if deletion races a save.
  try {
    await ref.update(data);
  } catch (error) {
    if ((error as { code?: number }).code === 5) {
      throw new AdminRepositoryError("Partner not found", 404);
    }
    throw error;
  }
  return { ...data, id };
}

export async function deletePartners(context: AdminContext, ids: string[]) {
  const partners = collection(context);
  const uniqueIds = [...new Set(ids.map(validId))];
  if (uniqueIds.length < 1 || uniqueIds.length > 500) {
    throw new AdminRepositoryError("Select between 1 and 500 partners", 400);
  }
  const batch = adminDbFor("mydnamap").batch();
  for (const id of uniqueIds) batch.delete(partners.doc(id));
  await batch.commit();
  return { deletedIds: uniqueIds };
}
