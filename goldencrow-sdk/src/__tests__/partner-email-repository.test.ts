import Fastify from "fastify";
import {
  serializerCompiler,
  validatorCompiler,
} from "fastify-type-provider-zod";
import type { AdminContext } from "../types/sdk.types.js";
import { sealPublisherAccessKey } from "../lib/publisher-portal-credentials.js";
import type { PartnerEmailTemplateVariant } from "../lib/connected-partner-email.js";
import { readFileSync } from "node:fs";
import { join } from "node:path";
const bannerDataUrl = `data:image/jpeg;base64,${readFileSync(join(process.cwd(), "src/__tests__/support/partner-banner.jpg")).toString("base64")}`;

type Data = Record<string, unknown>;
const mockDocs = new Map<string, Data>();
const mockReads: string[] = [];
const mockPublisherUser = jest.fn();
let mockFinalSetFails = false;
let mockReservationFails = false;
let mockTransactionTail = Promise.resolve();
function reference(collection: string, id: string) {
  const path = `${collection}/${id}`;
  return {
    path,
    id,
    get: async () => {
      mockReads.push(path);
      return { id, exists: mockDocs.has(path), data: () => mockDocs.get(path) };
    },
    set: async (data: Data) => {
      if (mockFinalSetFails) throw new Error("Write unavailable");
      mockDocs.set(path, data);
    },
  };
}
jest.mock("../config/firebase.js", () => ({
  adminAuthFor: () => ({ getUserByEmail: mockPublisherUser }),
  adminDbFor: () => ({
    collection: (name: string) => ({
      doc: (id: string) => reference(name, id),
    }),
    runTransaction: async (callback: (tx: unknown) => Promise<unknown>) => {
      const before = mockTransactionTail;
      let release = () => {};
      mockTransactionTail = new Promise<void>((resolve) => {
        release = resolve;
      });
      await before;
      try {
        const writes: Array<{ path: string; data: Data; create: boolean }> = [];
        const result = await callback({
          get: (ref: ReturnType<typeof reference>) => ref.get(),
          create: (ref: ReturnType<typeof reference>, data: Data) =>
            writes.push({ path: ref.path, data, create: true }),
          set: (ref: ReturnType<typeof reference>, data: Data) =>
            writes.push({ path: ref.path, data, create: false }),
        });
        if (mockReservationFails) throw new Error("Transaction unavailable");
        for (const write of writes) {
          if (write.create && mockDocs.has(write.path))
            throw new Error("Already exists");
          mockDocs.set(write.path, write.data);
        }
        return result;
      } finally {
        release();
      }
    },
  }),
}));
jest.mock("../lib/gmail-mailer.js", () => ({
  ...jest.requireActual("../lib/gmail-mailer.js"),
  sendGmailMessage: jest.fn(),
}));

import {
  GmailDeliveryOutcomeUnknownError,
  sendGmailMessage,
} from "../lib/gmail-mailer.js";
import {
  PARTNER_EMAIL_SENDS_COLLECTION,
  previewPartnerEmail,
  sendPartnerEmail,
} from "../repositories/partner-email.repository.js";
import { connectedPartnersRoutes } from "../routes/connected-partners.routes.js";

const context: AdminContext = {
  uid: "god",
  email: "god@example.com",
  role: "full_admin",
  isBootstrap: true,
  canAccessBackoffice: true,
  canAccessPatientPortal: false,
  canAccessPGFlex: false,
  projectAccess: ["mydnamap"],
};
const partnerId = "partner_one";
const requestId = "e379b6a1-e325-4cc2-a31e-5d8a7e499f77";
const partner = {
  companyName: "Genome Studio",
  firstName: "Ana",
  lastName: "Rivera",
  phoneNumber: "",
  email: "ana@example.com",
  meetingDate: null,
  notes: null,
  linkedOrganizationId: null,
  linkedIndividualPublisherId: null,
  linkedAppId: null,
  linkedOrganizationSnapshot: null,
  linkedIndividualPublisherSnapshot: null,
  linkedAppSnapshot: null,
};
const partnerPath = `connected-partners/${partnerId}`;
const requestPath = `${PARTNER_EMAIL_SENDS_COLLECTION}/${requestId}`;
async function input(templateVariant: PartnerEmailTemplateVariant = 1) {
  const base = await previewPartnerEmail(context, partnerId, "es", undefined, templateVariant);
  const banner = base.bannerBrand ? { contextHash: base.bannerBrand.contextHash, dataUrl: bannerDataUrl } : undefined;
  const preview = banner ? await previewPartnerEmail(context, partnerId, "es", banner, templateVariant) : base;
  return {
    requestId,
    language: "es" as const,
    templateVariant,
    previewHash: preview.previewHash,
    ...(banner ? { banner } : {}),
  };
}

it("uses the saved publisher key in both preview and sent link without storing credentials in the send command", async () => {
  const previousSecret = process.env.PUBLISHER_PORTAL_CREDENTIALS_SECRET;
  process.env.PUBLISHER_PORTAL_CREDENTIALS_SECRET = "partner-mail-test-secret-".repeat(3);
  try {
    mockDocs.set(partnerPath, { ...partner, linkedOrganizationId: "org_one" });
    mockDocs.set("feed_organizations/org_one", { name: "Genome Studio", portalAccessKey: sealPublisherAccessKey("organization", "org_one", "ana@example.com", "Test+Key&42") });
    mockDocs.set("user_roles/ana@example.com", { role: "organization_publisher", isActive: true, organizationId: "org_one", firebaseUid: "publisher-uid" });
    mockPublisherUser.mockResolvedValue({ uid: "publisher-uid", email: "ana@example.com", disabled: false, tokensValidAfterTime: "2026-11-10T00:00:00Z" });
    const args = await input();
    const preview = await previewPartnerEmail(context, partnerId, "es", args.banner);
    const code = new URL(preview.ctaUrl).searchParams.get("accessKey")!;
    expect(code).toBe("Test+Key&42");
    expect(preview.accessCodeExpiresAt).toBeUndefined();
    const result = await sendPartnerEmail(context, partnerId, args);
    expect(result.status).toBe("sent");
    expect(sendGmailMessage).toHaveBeenCalledWith(expect.objectContaining({ html: preview.html, text: preview.text }));
    expect(JSON.stringify(mockDocs.get(requestPath))).not.toContain(code);
    expect(JSON.stringify(mockDocs.get(requestPath))).not.toContain("customToken");
    expect(JSON.stringify(mockDocs.get(requestPath))).not.toContain("data:image");
    expect(sendGmailMessage).toHaveBeenCalledWith(expect.objectContaining({ inlineAttachments: [expect.objectContaining({ contentId: "partner-publisher-app-banner", mimeType: "image/jpeg", contentBase64: bannerDataUrl.split(",")[1] })] }));
  } finally {
    if (previousSecret === undefined) delete process.env.PUBLISHER_PORTAL_CREDENTIALS_SECRET;
    else process.env.PUBLISHER_PORTAL_CREDENTIALS_SECRET = previousSecret;
  }
});
async function server(adminContext: AdminContext | null = context) {
  const app = Fastify();
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  app.addHook("onRequest", async (request) => {
    request.adminContext = adminContext ?? undefined;
  });
  await app.register(connectedPartnersRoutes);
  return app;
}

it("requires the reviewed banner, rejects stale live branding and never sends an incomplete publisher email", async () => {
  mockDocs.set(partnerPath, { ...partner, linkedOrganizationId: "org_one" });
  mockDocs.set("feed_organizations/org_one", { name: "Genome Studio", colorHex: "#657960", imageUrl: "https://example.com/live.png" });
  const preview = await previewPartnerEmail(context, partnerId);
  expect(preview.bannerBrand).toMatchObject({ name: "Genome Studio", tint: "#657960", imageUrl: "https://example.com/live.png" });
  await expect(sendPartnerEmail(context, partnerId, { requestId, language: "es", previewHash: preview.previewHash })).rejects.toMatchObject({ statusCode: 412 });
  const args = await input();
  mockDocs.set("feed_organizations/org_one", { name: "Genome Studio", colorHex: "#123456" });
  await expect(sendPartnerEmail(context, partnerId, args)).rejects.toMatchObject({ statusCode: 412 });
  expect(sendGmailMessage).not.toHaveBeenCalled();
  expect(mockDocs.has(requestPath)).toBe(false);
});

it.each(["x-icon", "vnd.microsoft.icon"])("keeps uploaded %s publisher icons, matching the portal", async (mime) => {
  mockDocs.set(partnerPath, { ...partner, linkedOrganizationId: "org_one" });
  const icon = `data:image/${mime};base64,AAABAA==`;
  mockDocs.set("feed_organizations/org_one", { name: "Genome Studio", imageUrl: null, imageUploadDataUrl: icon });
  expect((await previewPartnerEmail(context, partnerId)).bannerBrand?.imageUrl).toBe(icon);
});
beforeEach(() => {
  mockDocs.clear();
  mockDocs.set(partnerPath, { ...partner });
  mockReads.length = 0;
  mockFinalSetFails = false;
  mockReservationFails = false;
  mockTransactionTail = Promise.resolve();
  jest.mocked(sendGmailMessage).mockReset().mockResolvedValue(undefined);
});

it.each([1, 2] as const)("sends exactly the reviewed server-generated template %s without writes during preview", async (templateVariant) => {
  const preview = await previewPartnerEmail(context, partnerId, "es", undefined, templateVariant);
  expect(mockDocs.size).toBe(1);
  expect(sendGmailMessage).not.toHaveBeenCalled();
  const command = await sendPartnerEmail(context, partnerId, {
    requestId,
    language: "es",
    templateVariant,
    previewHash: preview.previewHash,
  });
  expect(command).toEqual({
    status: "sent",
    to: partner.email,
    requestId,
    sentAt: expect.any(String),
  });
  expect(sendGmailMessage).toHaveBeenCalledWith({
    to: preview.to,
    subject: preview.subject,
    html: preview.html,
    text: preview.text,
  });
  expect(mockDocs.get(requestPath)).toEqual(
    expect.objectContaining({
      partnerId,
      requestId,
      status: "sent",
      previewHash: preview.previewHash,
      requestedByEmail: context.email,
      templateVariant,
    }),
  );
  expect(Object.keys(mockDocs.get(requestPath)!)).not.toEqual(
    expect.arrayContaining(["html", "text", "subject"]),
  );
  expect(
    Object.keys(mockDocs.get(requestPath)!).every((key) =>
      /^[a-z][A-Za-z0-9]*$/.test(key),
    ),
  ).toBe(true);
});

it.each(["email", "firstName", "companyName"])(
  "rejects stale preview after %s changes before any send",
  async (field) => {
    const args = await input();
    mockDocs.set(partnerPath, {
      ...partner,
      [field]: field === "email" ? "other@example.com" : "Changed",
    });
    await expect(
      sendPartnerEmail(context, partnerId, args),
    ).rejects.toMatchObject({ statusCode: 412 });
    expect(sendGmailMessage).not.toHaveBeenCalled();
    expect(mockDocs.has(requestPath)).toBe(false);
  },
);

it("reclassifies live app status before send even when stored snapshot remains testing", async () => {
  const app = {
    publisherKind: "organization",
    publisherId: "org_one",
    publisherName: "Organization One",
    status: "active_for_testing",
  };
  mockDocs.set("feed_organizations/org_one", { name: "Organization One" });
  mockDocs.set("app_configs/app_one", app);
  mockDocs.set(partnerPath, {
    ...partner,
    linkedOrganizationId: "org_one",
    linkedAppId: "app_one",
    linkedOrganizationSnapshot: { id: "org_one", name: "Organization One" },
    linkedAppSnapshot: { ...app, id: "app_one" },
  });
  const args = await input();
  mockDocs.set("app_configs/app_one", {
    ...app,
    status: "active_waiting_for_payment",
  });
  await expect(
    sendPartnerEmail(context, partnerId, args),
  ).rejects.toMatchObject({ statusCode: 412 });
  expect(sendGmailMessage).not.toHaveBeenCalled();
  expect((await previewPartnerEmail(context, partnerId)).category).toBe(
    "contract",
  );
});

it("returns an already sent command after partner edits or deletion without issuing another send", async () => {
  const args = await input();
  const first = await sendPartnerEmail(context, partnerId, args);
  mockDocs.delete(partnerPath);
  const readsBefore = mockReads.length;
  expect(await sendPartnerEmail(context, partnerId, args)).toEqual(first);
  expect(mockReads.slice(readsBefore)).toEqual([requestPath]);
  expect(sendGmailMessage).toHaveBeenCalledTimes(1);
});

it("serializes concurrent submissions so only the owner of the reservation calls Gmail", async () => {
  let finish = () => {};
  const delivery = new Promise<void>((resolve) => {
    finish = resolve;
  });
  jest.mocked(sendGmailMessage).mockReturnValue(delivery);
  const args = await input();
  const first = sendPartnerEmail(context, partnerId, args);
  for (
    let attempt = 0;
    attempt < 20 && !jest.mocked(sendGmailMessage).mock.calls.length;
    attempt++
  )
    await new Promise<void>((resolve) => setImmediate(resolve));
  expect(sendGmailMessage).toHaveBeenCalledTimes(1);
  expect((await sendPartnerEmail(context, partnerId, args)).status).toBe(
    "sending",
  );
  finish();
  expect((await first).status).toBe("sent");
  expect(sendGmailMessage).toHaveBeenCalledTimes(1);
});

it("keeps unknown delivery check-only, including after the partner is deleted", async () => {
  jest
    .mocked(sendGmailMessage)
    .mockRejectedValue(
      new GmailDeliveryOutcomeUnknownError(new Error("network lost")),
    );
  const args = await input();
  const first = await sendPartnerEmail(context, partnerId, args);
  expect(first.status).toBe("unknown");
  expect(first.error).toContain("will not send the email again");
  mockDocs.delete(partnerPath);
  expect(await sendPartnerEmail(context, partnerId, args)).toEqual(first);
  expect(sendGmailMessage).toHaveBeenCalledTimes(1);
});

it("permits same-ID retry only after a known rejection and rechecks the current preview", async () => {
  const args = await input();
  jest
    .mocked(sendGmailMessage)
    .mockRejectedValueOnce(new Error("OAuth unavailable"));
  expect((await sendPartnerEmail(context, partnerId, args)).status).toBe(
    "failed",
  );
  mockDocs.set(partnerPath, { ...partner, email: "changed@example.com" });
  await expect(
    sendPartnerEmail(context, partnerId, args),
  ).rejects.toMatchObject({ statusCode: 412 });
  expect(sendGmailMessage).toHaveBeenCalledTimes(1);
  mockDocs.set(partnerPath, { ...partner });
  expect((await sendPartnerEmail(context, partnerId, args)).status).toBe(
    "sent",
  );
  expect(sendGmailMessage).toHaveBeenCalledTimes(2);
});

it("fails closed when confirmation storage is unavailable and never resends a reserved command", async () => {
  const args = await input();
  mockFinalSetFails = true;
  expect((await sendPartnerEmail(context, partnerId, args)).status).toBe(
    "unknown",
  );
  expect(mockDocs.get(requestPath)?.status).toBe("sending");
  expect((await sendPartnerEmail(context, partnerId, args)).status).toBe(
    "sending",
  );
  expect(sendGmailMessage).toHaveBeenCalledTimes(1);
});

it("does not send if the durable reservation fails", async () => {
  const args = await input();
  mockReservationFails = true;
  await expect(sendPartnerEmail(context, partnerId, args)).rejects.toThrow(
    "Transaction unavailable",
  );
  expect(sendGmailMessage).not.toHaveBeenCalled();
});

it("rejects request-ID reuse for a different partner, hash, language or template without re-reading mutable contacts", async () => {
  const args = await input();
  await sendPartnerEmail(context, partnerId, args);
  for (const [id, changed] of [
    ["different_partner", args],
    [partnerId, { ...args, previewHash: "a".repeat(64) }],
    [partnerId, { ...args, language: "en" as const }],
    [partnerId, { ...args, templateVariant: 2 as const }],
  ] as const)
    await expect(sendPartnerEmail(context, id, changed)).rejects.toMatchObject({
      statusCode: 409,
    });
  expect(sendGmailMessage).toHaveBeenCalledTimes(1);
});

it("enforces GOD MODE before touching Firestore or transport at both repository entry points", async () => {
  mockReads.length = 0;
  const regular = { ...context, isBootstrap: false };
  await expect(previewPartnerEmail(regular, partnerId)).rejects.toMatchObject({
    statusCode: 403,
  });
  await expect(
    sendPartnerEmail(regular, partnerId, {
      language: "es",
      requestId,
      previewHash: "a".repeat(64),
    }),
  ).rejects.toMatchObject({ statusCode: 403 });
  expect(mockReads).toHaveLength(0);
  expect(sendGmailMessage).not.toHaveBeenCalled();
});

it("authenticates preview/send routes and rejects client recipients, bodies, unknown language and aliases", async () => {
  for (const [admin, status] of [
    [null, 401],
    [{ ...context, isBootstrap: false }, 403],
  ] as const) {
    const app = await server(admin);
    expect(
      (
        await app.inject({
          method: "GET",
          url: `/admin/connected-partners/${partnerId}/email-preview`,
        })
      ).statusCode,
    ).toBe(status);
    expect(
      (
        await app.inject({
          method: "POST",
          url: `/admin/connected-partners/${partnerId}/email`,
          payload: {},
        })
      ).statusCode,
    ).toBe(status);
    await app.close();
  }
  const app = await server();
  const args = await input();
  const preview = await app.inject({
    method: "GET",
    url: `/admin/connected-partners/${partnerId}/email-preview`,
  });
  expect(preview.statusCode).toBe(200);
  expect(preview.json().language).toBe("es");
  expect(preview.json().templateVariant).toBe(1);
  expect(preview.headers["cache-control"]).toBe("private, no-store");
  expect(
    (
      await app.inject({
        method: "GET",
        url: `/admin/connected-partners/${partnerId}/email-preview?language=fr`,
      })
    ).statusCode,
  ).toBe(400);
  const second = await app.inject({ method: "GET", url: `/admin/connected-partners/${partnerId}/email-preview?language=en&templateVariant=2` });
  expect(second.statusCode).toBe(200);
  expect(second.json()).toMatchObject({ language: "en", templateVariant: 2, subject: "Join us on Pocket Genes!" });
  for (const query of ["templateVariant=3", "templateVariant=1.0", "template_variant=2"]) {
    expect((await app.inject({ method: "GET", url: `/admin/connected-partners/${partnerId}/email-preview?${query}` })).statusCode).toBe(400);
  }
  for (const extra of [
    { to: "attacker@example.com" },
    { html: "changed" },
    { preview_hash: args.previewHash },
    { templateVariant: 3 },
    { templateVariant: "2" },
    { template_variant: 2 },
  ])
    expect(
      (
        await app.inject({
          method: "POST",
          url: `/admin/connected-partners/${partnerId}/email`,
          payload: { ...args, ...extra },
        })
      ).statusCode,
    ).toBe(400);
  const sent = await app.inject({
    method: "POST",
    url: `/admin/connected-partners/${partnerId}/email`,
    payload: args,
  });
  expect(sent.statusCode).toBe(200);
  expect(sent.json().status).toBe("sent");
  expect(sendGmailMessage).toHaveBeenCalledTimes(1);
  await app.close();
});

it("rejects noncanonical keys in stored delivery commands instead of preserving aliases", async () => {
  const args = await input();
  await sendPartnerEmail(context, partnerId, args);
  const stored = mockDocs.get(requestPath)!;
  const { sentAt, ...rest } = stored;
  mockDocs.set(requestPath, { ...rest, sent_at: sentAt });
  await expect(
    sendPartnerEmail(context, partnerId, args),
  ).rejects.toMatchObject({ statusCode: 409 });
  expect(sendGmailMessage).toHaveBeenCalledTimes(1);
});

it("returns an unsent precondition failure if a preview's live app becomes unavailable", async () => {
  const app = {
    publisherKind: "organization",
    publisherId: "org_one",
    publisherName: "Organization One",
    status: "active_for_testing",
  };
  mockDocs.set("feed_organizations/org_one", { name: "Organization One" });
  mockDocs.set("app_configs/app_one", app);
  mockDocs.set(partnerPath, {
    ...partner,
    linkedOrganizationId: "org_one",
    linkedAppId: "app_one",
  });
  const args = await input();
  mockDocs.delete("app_configs/app_one");
  await expect(
    sendPartnerEmail(context, partnerId, args),
  ).rejects.toMatchObject({ statusCode: 412 });
  expect(sendGmailMessage).not.toHaveBeenCalled();
  expect(mockDocs.has(requestPath)).toBe(false);
});

it("rejects a template switch paired with the old preview hash before reserving or sending", async () => {
  const args = await input(1);
  await expect(sendPartnerEmail(context, partnerId, { ...args, templateVariant: 2 })).rejects.toMatchObject({ statusCode: 412 });
  expect(sendGmailMessage).not.toHaveBeenCalled();
  expect(mockDocs.has(requestPath)).toBe(false);
});

it("binds the banner to the chosen template and sends the exact second-template API preview", async () => {
  mockDocs.set(partnerPath, { ...partner, linkedOrganizationId: "org_one" });
  mockDocs.set("feed_organizations/org_one", { name: "Genome Studio", colorHex: "#657960" });
  const first = await input(1);
  await expect(previewPartnerEmail(context, partnerId, "es", first.banner, 2)).rejects.toMatchObject({ statusCode: 412 });
  const app = await server();
  try {
    const initial = (await app.inject({ method: "GET", url: `/admin/connected-partners/${partnerId}/email-preview?templateVariant=2` })).json();
    const banner = { contextHash: initial.bannerBrand.contextHash, dataUrl: bannerDataUrl };
    const prepared = await app.inject({ method: "POST", url: `/admin/connected-partners/${partnerId}/email-preview`, payload: { language: "es", templateVariant: 2, banner } });
    expect(prepared.statusCode).toBe(200);
    const preview = prepared.json();
    expect(preview).toMatchObject({ templateVariant: 2, subject: "¡Una app para Genome Studio!", banner });
    const sent = await app.inject({ method: "POST", url: `/admin/connected-partners/${partnerId}/email`, payload: { language: "es", templateVariant: 2, banner, previewHash: preview.previewHash, requestId } });
    expect(sent.statusCode).toBe(200);
    expect(sent.json().status).toBe("sent");
    expect(sendGmailMessage).toHaveBeenCalledWith(expect.objectContaining({ subject: preview.subject, html: preview.html, text: preview.text, inlineAttachments: [expect.objectContaining({ contentBase64: bannerDataUrl.split(",")[1] })] }));
    expect(mockDocs.get(requestPath)?.templateVariant).toBe(2);
  } finally {
    await app.close();
  }
});

it("replays historical template-one commands with no saved variant before reading mutable contacts", async () => {
  const args = await input(1);
  const first = await sendPartnerEmail(context, partnerId, args);
  delete mockDocs.get(requestPath)!.templateVariant;
  mockDocs.delete(partnerPath);
  mockReads.length = 0;
  const { templateVariant, ...legacyInput } = args;
  expect(templateVariant).toBe(1);
  expect(await sendPartnerEmail(context, partnerId, legacyInput)).toEqual(first);
  expect(mockReads).toEqual([requestPath]);
  await expect(sendPartnerEmail(context, partnerId, { ...args, templateVariant: 2 })).rejects.toMatchObject({ statusCode: 409 });
  expect(sendGmailMessage).toHaveBeenCalledTimes(1);
});

it("rejects a snake-case template alias in persisted delivery commands", async () => {
  const args = await input(2);
  await sendPartnerEmail(context, partnerId, args);
  const stored = mockDocs.get(requestPath)!;
  stored.template_variant = stored.templateVariant;
  delete stored.templateVariant;
  await expect(sendPartnerEmail(context, partnerId, args)).rejects.toMatchObject({ statusCode: 409 });
  expect(sendGmailMessage).toHaveBeenCalledTimes(1);
});
