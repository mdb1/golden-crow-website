import { createHash } from "node:crypto";
import { z } from "zod";
import { adminDbFor } from "../config/firebase.js";
import {
  CONNECTED_PARTNERS_COLLECTION,
  PartnerInputSchema,
  PartnerLinkIdSchema,
  type Partner,
} from "../contracts/connected-partners.js";
import type { AdminContext } from "../types/sdk.types.js";
import { AdminRepositoryError } from "./admin-errors.js";
import { getPartner, preparePartner } from "./connected-partners.repository.js";
import {
  getPartnershipCrmOrganization,
  getPartnershipCrmProfessional,
} from "./partnership-crm.repository.js";

export type CrmPartnerResult = { partner: Partner; created: boolean };
type TargetKind = "organizations" | "professionals";

function contactNames(value: string) {
  const words = value.trim().replace(/^(?:dr|dra)\.?\s+/i, "").split(/\s+/);
  const firstName = words[0] ?? "";
  const lastName = words.slice(1).join(" ");
  return firstName.length <= 140 && lastName.length <= 140
    ? { firstName, lastName }
    : { firstName: "", lastName: "" };
}

export async function addCrmTargetAsPartner(
  context: AdminContext,
  targetKind: TargetKind,
  targetId: string,
): Promise<CrmPartnerResult> {
  if (!context.isBootstrap)
    throw new AdminRepositoryError("GOD MODE access required", 403);
  const parsedId = PartnerLinkIdSchema.safeParse(targetId);
  if (!parsedId.success)
    throw new AdminRepositoryError("Invalid CRM record ID", 400);

  const organization = targetKind === "organizations"
    ? await getPartnershipCrmOrganization(context, parsedId.data)
    : null;
  const professional = targetKind === "professionals"
    ? await getPartnershipCrmProfessional(context, parsedId.data)
    : null;
  const target = organization ?? professional!;
  const email = (organization?.contactEmail ?? professional!.email).trim().toLowerCase();
  if (!z.string().email().max(254).safeParse(email).success)
    throw new AdminRepositoryError(
      "Add a valid email to this CRM record before adding it as a partner.",
      400,
    );

  const extra = [
    ["Sitio web", target.website],
    ["País", target.country],
    ["LinkedIn", organization?.contactLinkedIn ?? professional?.linkedIn],
    ["Último contacto", target.lastContactAt],
    ["Título", professional?.title],
    ["Institución", professional?.primaryAffiliation],
    ["Afinidad con Pocket Genes", professional?.potentialPocketGenesEditorFit],
    ["Contexto de investigación", professional?.researchBasis],
    ["Referencia de email", professional?.emailRoute],
    ["Referencia de LinkedIn", professional?.linkedInRoute],
  ].filter(([, value]) => value?.trim()).map(([label, value]) => `${label}: ${value!.trim()}`);
  const input = PartnerInputSchema.safeParse({
    companyName: target.name,
    ...contactNames(organization?.contactName ?? professional!.name),
    email,
    phoneNumber: "",
    meetingDate: null,
    notes: [target.notes.trim(), ...extra].filter(Boolean).join("\n\n") || null,
    // CRM records are prospect identities, not Discover publishers or apps.
    linkedOrganizationId: null,
    linkedIndividualPublisherId: null,
    linkedAppId: null,
  });
  if (!input.success)
    throw new AdminRepositoryError(
      "This CRM record needs corrections before it can become a partner.",
      400,
    );

  const data = await preparePartner(input.data);
  const db = adminDbFor("mydnamap");
  const partners = db.collection(CONNECTED_PARTNERS_COLLECTION);
  // The same normalized contact email always resolves to the same command.
  const id = `crm_${createHash("sha256").update(email).digest("hex")}`;
  const ref = partners.doc(id);
  const result = await db.runTransaction(async (transaction) => {
    const deterministic = await transaction.get(ref);
    if (deterministic.exists) return { id, created: false };
    const existing = await transaction.get(partners.where("email", "==", email).limit(1));
    if (existing.docs[0]) return { id: existing.docs[0].id, created: false };
    transaction.create(ref, data);
    return { id, created: true };
  });
  return { partner: await getPartner(context, result.id), created: result.created };
}
