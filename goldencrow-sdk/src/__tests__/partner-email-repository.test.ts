import Fastify from "fastify";
import {
  serializerCompiler,
  validatorCompiler,
} from "fastify-type-provider-zod";
import type { AdminContext } from "../types/sdk.types.js";
import { sealPublisherAccessKey } from "../lib/publisher-portal-credentials.js";
import { readPublisherAccessCode } from "../lib/publisher-access-code.js";
import { exchangePublisherAccessCode } from "../repositories/publisher-access-code.repository.js";
import type { PartnerEmailTemplateVariant } from "../lib/connected-partner-email.js";
import { readFileSync } from "node:fs";
import { join } from "node:path";
const bannerDataUrl = `data:image/jpeg;base64,${readFileSync(join(process.cwd(), "src/__tests__/support/partner-banner.jpg")).toString("base64")}`;

type Data = Record<string, unknown>;
const mockDocs = new Map<string, Data>();
const mockReads: string[] = [];
const mockQueries: Array<{
  collection: string;
  limit?: number;
  fields?: string[];
  cursor?: unknown[];
  orders: Array<[string, string]>;
}> = [];
const mockPublisherUser = jest.fn();
const mockPublisherCustomToken = jest.fn();
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
function query(
  collection: string,
  fields?: string[],
  cursor?: unknown[],
  limit?: number,
  orders: Array<[string, string]> = [],
) {
  return {
    doc: (id: string) => reference(collection, id),
    orderBy: (field: unknown, direction: string) =>
      query(collection, fields, cursor, limit, [
        ...orders,
        [typeof field === "string" ? field : "__name__", direction],
      ]),
    select: (...nextFields: string[]) =>
      query(collection, nextFields, cursor, limit, orders),
    startAfter: (...values: unknown[]) =>
      query(collection, fields, values, limit, orders),
    limit: (nextLimit: number) =>
      query(collection, fields, cursor, nextLimit, orders),
    get: async () => {
      mockQueries.push({ collection, fields, cursor, limit, orders });
      const items = [...mockDocs]
        .filter(([path]) => path.startsWith(`${collection}/`))
        .map(([path, data]) => ({
          id: path.slice(collection.length + 1),
          data,
        }))
        .sort(
          (a, b) =>
            String(b.data.updatedAt).localeCompare(String(a.data.updatedAt)) ||
            b.id.localeCompare(a.id),
        )
        .filter(
          ({ id, data }) =>
            !cursor ||
            String(data.updatedAt) < String(cursor[0]) ||
            (data.updatedAt === cursor[0] && id < String(cursor[1])),
        );
      return {
        docs: items.slice(0, limit).map(({ id, data }) => {
          let projected = data;
          if (fields) {
            projected = {};
            for (const field of fields) {
              const [key, nested] = field.split(".");
              if (!nested) {
                if (data[key!] !== undefined) projected[key!] = data[key!];
              } else if (
                data[key!] &&
                (data[key!] as Data)[nested] !== undefined
              ) {
                const nestedObject = (projected[key!] ??= {}) as Data;
                nestedObject[nested] = (data[key!] as Data)[nested];
              }
            }
          }
          return { id, data: () => projected };
        }),
      };
    },
  };
}
jest.mock("../config/firebase.js", () => ({
  adminAuthFor: () => ({ getUserByEmail: mockPublisherUser, createCustomToken: mockPublisherCustomToken }),
  adminDbFor: () => ({
    collection: (name: string) => query(name),
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
  listPartnerEmailHistory,
  getPartnerEmailHistory,
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
  const base = await previewPartnerEmail(
    context,
    partnerId,
    "es",
    undefined,
    templateVariant,
  );
  const banner = base.bannerBrand
    ? { contextHash: base.bannerBrand.contextHash, dataUrl: bannerDataUrl }
    : undefined;
  const preview = banner
    ? await previewPartnerEmail(
        context,
        partnerId,
        "es",
        banner,
        templateVariant,
      )
    : base;
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
  process.env.PUBLISHER_PORTAL_CREDENTIALS_SECRET =
    "partner-mail-test-secret-".repeat(3);
  try {
    mockDocs.set(partnerPath, { ...partner, linkedOrganizationId: "org_one" });
    mockDocs.set("feed_organizations/org_one", {
      name: "Genome Studio",
      portalAccessKey: sealPublisherAccessKey(
        "organization",
        "org_one",
        "ana@example.com",
        "Test+Key&42",
      ),
    });
    mockDocs.set("user_roles/ana@example.com", {
      role: "organization_publisher",
      isActive: true,
      organizationId: "org_one",
      firebaseUid: "publisher-uid",
    });
    mockPublisherUser.mockResolvedValue({
      uid: "publisher-uid",
      email: "ana@example.com",
      disabled: false,
      tokensValidAfterTime: "2026-11-10T00:00:00Z",
    });
    const args = await input();
    const preview = await previewPartnerEmail(
      context,
      partnerId,
      "es",
      args.banner,
    );
    const code = new URL(preview.ctaUrl).searchParams.get("accessKey")!;
    expect(code).toBe("Test+Key&42");
    expect(preview.accessCodeExpiresAt).toBeUndefined();
    const result = await sendPartnerEmail(context, partnerId, args);
    expect(result.status).toBe("sent");
    expect(mockPublisherUser).not.toHaveBeenCalled();
    expect(sendGmailMessage).toHaveBeenCalledWith(
      expect.objectContaining({ html: preview.html, text: preview.text }),
      expect.any(Object),
    );
    expect(JSON.stringify(mockDocs.get(requestPath))).not.toContain(code);
    expect(JSON.stringify(mockDocs.get(requestPath))).not.toContain(
      encodeURIComponent(code),
    );
    expect(JSON.stringify(mockDocs.get(requestPath))).not.toContain(
      "accessKey=",
    );
    const history = await getPartnerEmailHistory(context, requestId);
    expect(history).toMatchObject({
      from: "federico@goldencrowvs.com",
      subject: preview.subject,
      accessKeyOmitted: true,
      messageAvailable: true,
    });
    expect(history.messageText).not.toContain("accessKey=");
    expect(history.messageText).toContain("/publisher-portal/login?email=");
    expect(JSON.stringify(mockDocs.get(requestPath))).not.toContain(
      "customToken",
    );
    expect(JSON.stringify(mockDocs.get(requestPath))).not.toContain(
      "data:image",
    );
    expect(sendGmailMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        inlineAttachments: [
          expect.objectContaining({
            contentId: "partner-publisher-app-banner",
            mimeType: "image/jpeg",
            contentBase64: bannerDataUrl.split(",")[1],
          }),
        ],
      }),
      expect.any(Object),
    );
  } finally {
    if (previousSecret === undefined)
      delete process.env.PUBLISHER_PORTAL_CREDENTIALS_SECRET;
    else process.env.PUBLISHER_PORTAL_CREDENTIALS_SECRET = previousSecret;
  }
});

describe("publisher email access-token fallback", () => {
  const secretEnv = "PUBLISHER_PORTAL_ACCESS_CODE_SIGNING_SECRET";
  const originalSecret = process.env[secretEnv];
  beforeEach(() => {
    jest.useFakeTimers({ now: new Date("2026-11-11T12:00:00Z") });
    process.env[secretEnv] = "partner-email-fallback-test-secret-".repeat(2);
    mockPublisherCustomToken.mockResolvedValue(
      "primary-publisher-custom-token",
    );
  });
  afterEach(() => {
    jest.useRealTimers();
    if (originalSecret === undefined) delete process.env[secretEnv];
    else process.env[secretEnv] = originalSecret;
  });

  function linkAccount(
    kind: "organization" | "individual",
    status: "active_for_testing" | "active" | null = null,
  ) {
    const id = kind === "organization" ? "org_one" : "person_one";
    mockDocs.set(partnerPath, {
      ...partner,
      linkedOrganizationId: kind === "organization" ? id : null,
      linkedIndividualPublisherId: kind === "individual" ? id : null,
      linkedAppId: status ? "app_one" : null,
    });
    mockDocs.set(
      `${kind === "organization" ? "feed_organizations" : "feed_individuals"}/${id}`,
      {
        name: "Genome Studio",
        ...(kind === "organization" ? { portalAccessKey: null } : {}),
      },
    );
    mockDocs.set("user_roles/ana@example.com", {
      role: `${kind}_publisher`,
      isActive: true,
      [kind === "organization" ? "organizationId" : "individualId"]: id,
      firebaseUid: "publisher-uid",
    });
    mockPublisherUser.mockResolvedValue({
      uid: "publisher-uid",
      email: "ana@example.com",
      disabled: false,
      tokensValidAfterTime: "2026-11-10T00:00:00Z",
    });
    if (status)
      mockDocs.set("app_configs/app_one", {
        publisherKind: kind,
        publisherId: id,
        publisherName: "Genome Studio",
        status,
      });
    return id;
  }

  it.each([
    ["organization", null, 3, "/publisher-portal/app/new"],
    [
      "organization",
      "active_for_testing",
      2,
      "/publisher-portal/app/accept-terms-and-conditions",
    ],
    ["organization", "active", 1, "/publisher-portal/app/edit"],
    ["individual", null, 2, "/publisher-portal/app/new"],
    [
      "individual",
      "active_for_testing",
      1,
      "/publisher-portal/app/accept-terms-and-conditions",
    ],
    ["individual", "active", 2, "/publisher-portal/app/edit"],
  ] as const)(
    "uses a redeemable signed token for %s/%s without a saved key",
    async (kind, status, variant, callback) => {
      const id = linkAccount(kind, status);
      const publisherPath = `${kind === "organization" ? "feed_organizations" : "feed_individuals"}/${id}`;
      const publisherBefore = { ...mockDocs.get(publisherPath) };
      const args = await input(variant);
      const preview = await previewPartnerEmail(
        context,
        partnerId,
        "es",
        args.banner,
        variant,
      );
      const url = new URL(preview.ctaUrl);
      const token = url.searchParams.get("accessKey")!;
      expect(token).toMatch(/^pgp1\./);
      expect(token.length).toBeGreaterThan(256);
      expect(url.searchParams.get("email")).toBe(partner.email);
      expect(url.searchParams.get("callbackUrl")).toBe(callback);
      const payload = readPublisherAccessCode(token, partner.email);
      expect(payload).toMatchObject({
        uid: "publisher-uid",
        email: partner.email,
        publisherKind: kind,
        publisherId: id,
        partnerId,
      });
      expect(preview.accessCodeExpiresAt).toBe(
        new Date(payload.expiresAt * 1000).toISOString(),
      );
      expect(preview.accessCodeUnavailableReason).toBeUndefined();
      expect(preview.previewHash).toBe(args.previewHash);
      expect(mockDocs.has(requestPath)).toBe(false);
      expect(mockDocs.get(publisherPath)).toEqual(publisherBefore);

      jest.setSystemTime(new Date("2026-11-11T15:30:00Z"));
      expect((await sendPartnerEmail(context, partnerId, args)).status).toBe(
        "sent",
      );
      expect(sendGmailMessage).toHaveBeenCalledWith(
        expect.objectContaining({ text: preview.text, html: preview.html }),
        expect.any(Object),
      );
      expect(JSON.stringify([...mockDocs])).not.toContain(token);
      expect(JSON.stringify(mockDocs.get(requestPath))).not.toContain(
        "accessKey=",
      );
      expect(
        (await getPartnerEmailHistory(context, requestId)).accessKeyOmitted,
      ).toBe(true);
      expect(mockDocs.get(publisherPath)).toEqual(publisherBefore);
      expect(mockPublisherCustomToken).not.toHaveBeenCalled();

      expect(await exchangePublisherAccessCode(partner.email, token)).toEqual({
        customToken: "primary-publisher-custom-token",
      });
      expect(mockPublisherCustomToken).toHaveBeenCalledWith("publisher-uid");
    },
  );

  it.each(["inactive", "disabled", "missingUser"] as const)(
    "does not put an access token in the email for an %s account",
    async (state) => {
      linkAccount("organization");
      if (state === "inactive")
        mockDocs.get("user_roles/ana@example.com")!.isActive = false;
      else if (state === "disabled")
        mockPublisherUser.mockResolvedValue({
          uid: "publisher-uid",
          email: partner.email,
          disabled: true,
        });
      else mockPublisherUser.mockRejectedValue({ code: "auth/user-not-found" });
      const preview = await previewPartnerEmail(context, partnerId);
      expect(new URL(preview.ctaUrl).searchParams.has("accessKey")).toBe(false);
      expect(preview.accessCodeExpiresAt).toBeUndefined();
      expect(preview.accessCodeUnavailableReason).toContain(
        "active publisher account matching",
      );
      expect(mockPublisherCustomToken).not.toHaveBeenCalled();
    },
  );

  it("does not use an organization's account to access a linked individual's app", async () => {
    linkAccount("individual", "active");
    mockDocs.set("feed_organizations/org_other", {
      name: "Other Organization",
    });
    mockDocs.get(partnerPath)!.linkedOrganizationId = "org_other";
    mockDocs.set("user_roles/ana@example.com", {
      role: "organization_publisher",
      isActive: true,
      organizationId: "org_other",
      firebaseUid: "publisher-uid",
    });
    const preview = await previewPartnerEmail(context, partnerId);
    expect(new URL(preview.ctaUrl).searchParams.has("accessKey")).toBe(false);
    expect(preview.accessCodeUnavailableReason).toBeDefined();
    expect(mockPublisherCustomToken).not.toHaveBeenCalled();
  });

  it("requires a fresh preview if the account loses access before sending", async () => {
    linkAccount("organization");
    const args = await input();
    mockDocs.get("user_roles/ana@example.com")!.isActive = false;
    await expect(
      sendPartnerEmail(context, partnerId, args),
    ).rejects.toMatchObject({ statusCode: 412 });
    expect(sendGmailMessage).not.toHaveBeenCalled();
    expect(mockDocs.has(requestPath)).toBe(false);
  });
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
  mockDocs.set("feed_organizations/org_one", {
    name: "Genome Studio",
    colorHex: "#657960",
    imageUrl: "https://example.com/live.png",
  });
  const preview = await previewPartnerEmail(context, partnerId);
  expect(preview.bannerBrand).toMatchObject({
    name: "Genome Studio",
    tint: "#657960",
    imageUrl: "https://example.com/live.png",
  });
  await expect(
    sendPartnerEmail(context, partnerId, {
      requestId,
      language: "es",
      previewHash: preview.previewHash,
    }),
  ).rejects.toMatchObject({ statusCode: 412 });
  const args = await input();
  mockDocs.set("feed_organizations/org_one", {
    name: "Genome Studio",
    colorHex: "#123456",
  });
  await expect(
    sendPartnerEmail(context, partnerId, args),
  ).rejects.toMatchObject({ statusCode: 412 });
  expect(sendGmailMessage).not.toHaveBeenCalled();
  expect(mockDocs.has(requestPath)).toBe(false);
});

it.each(["x-icon", "vnd.microsoft.icon"])(
  "keeps uploaded %s publisher icons, matching the portal",
  async (mime) => {
    mockDocs.set(partnerPath, { ...partner, linkedOrganizationId: "org_one" });
    const icon = `data:image/${mime};base64,AAABAA==`;
    mockDocs.set("feed_organizations/org_one", {
      name: "Genome Studio",
      imageUrl: null,
      imageUploadDataUrl: icon,
    });
    expect(
      (await previewPartnerEmail(context, partnerId)).bannerBrand?.imageUrl,
    ).toBe(icon);
  },
);
beforeEach(() => {
  mockDocs.clear();
  mockDocs.set(partnerPath, { ...partner });
  mockReads.length = 0;
  mockQueries.length = 0;
  mockFinalSetFails = false;
  mockReservationFails = false;
  mockTransactionTail = Promise.resolve();
  mockPublisherUser.mockReset().mockRejectedValue({ code: "auth/user-not-found" });
  mockPublisherCustomToken.mockReset();
  jest.mocked(sendGmailMessage).mockReset().mockResolvedValue(undefined);
});

it.each([1, 2, 3] as const)(
  "sends exactly the reviewed server-generated template %s without writes during preview",
  async (templateVariant) => {
    const preview = await previewPartnerEmail(
      context,
      partnerId,
      "es",
      undefined,
      templateVariant,
    );
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
    expect(sendGmailMessage).toHaveBeenCalledWith(
      {
        to: preview.to,
        subject: preview.subject,
        html: preview.html,
        text: preview.text,
      },
      expect.objectContaining({
        from: "Federico Bustos Fierro <federico@goldencrowvs.com>",
        user: "federico@goldencrowvs.com",
        appendSendAsSignature: false,
      }),
    );
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
    expect(mockDocs.get(requestPath)?.historySnapshot).toEqual({
      partnerName: partner.companyName,
      from: "federico@goldencrowvs.com",
      subject: preview.subject,
      category: preview.category,
      messageText: preview.text,
      accessKeyOmitted: false,
    });
    expect(Object.keys(mockDocs.get(requestPath)!)).not.toEqual(
      expect.arrayContaining(["html", "text", "subject"]),
    );
    expect(
      Object.keys(mockDocs.get(requestPath)!).every((key) =>
        /^[a-z][A-Za-z0-9]*$/.test(key),
      ),
    ).toBe(true);
  },
);

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
  const second = await app.inject({
    method: "GET",
    url: `/admin/connected-partners/${partnerId}/email-preview?language=en&templateVariant=2`,
  });
  expect(second.statusCode).toBe(200);
  expect(second.json()).toMatchObject({
    language: "en",
    templateVariant: 2,
    subject: "Join us on Pocket Genes!",
  });
  const firstOption = await app.inject({ method: "GET", url: `/admin/connected-partners/${partnerId}/email-preview?language=en&templateVariant=3` });
  expect(firstOption.statusCode).toBe(200);
  expect(firstOption.json()).toMatchObject({ language: "en", templateVariant: 3, subject: "Genome Studio, join us on Pocket Genes!" });
  for (const query of [
    "templateVariant=4",
    "templateVariant=1.0",
    "template_variant=2",
  ]) {
    expect(
      (
        await app.inject({
          method: "GET",
          url: `/admin/connected-partners/${partnerId}/email-preview?${query}`,
        })
      ).statusCode,
    ).toBe(400);
  }
  for (const extra of [
    { to: "attacker@example.com" },
    { from: "no-reply@example.com" },
    { html: "changed" },
    { preview_hash: args.previewHash },
    { templateVariant: 4 },
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
  await expect(
    sendPartnerEmail(context, partnerId, { ...args, templateVariant: 2 }),
  ).rejects.toMatchObject({ statusCode: 412 });
  expect(sendGmailMessage).not.toHaveBeenCalled();
  expect(mockDocs.has(requestPath)).toBe(false);
});

it("binds the banner to the chosen template and sends the exact second-template API preview", async () => {
  mockDocs.set(partnerPath, { ...partner, linkedOrganizationId: "org_one" });
  mockDocs.set("feed_organizations/org_one", {
    name: "Genome Studio",
    colorHex: "#657960",
  });
  const first = await input(1);
  await expect(
    previewPartnerEmail(context, partnerId, "es", first.banner, 2),
  ).rejects.toMatchObject({ statusCode: 412 });
  const app = await server();
  try {
    const initial = (
      await app.inject({
        method: "GET",
        url: `/admin/connected-partners/${partnerId}/email-preview?templateVariant=2`,
      })
    ).json();
    const banner = {
      contextHash: initial.bannerBrand.contextHash,
      dataUrl: bannerDataUrl,
    };
    const prepared = await app.inject({
      method: "POST",
      url: `/admin/connected-partners/${partnerId}/email-preview`,
      payload: { language: "es", templateVariant: 2, banner },
    });
    expect(prepared.statusCode).toBe(200);
    const preview = prepared.json();
    expect(preview).toMatchObject({
      templateVariant: 2,
      subject: "¡Una app para Genome Studio!",
      banner,
    });
    const sent = await app.inject({
      method: "POST",
      url: `/admin/connected-partners/${partnerId}/email`,
      payload: {
        language: "es",
        templateVariant: 2,
        banner,
        previewHash: preview.previewHash,
        requestId,
      },
    });
    expect(sent.statusCode).toBe(200);
    expect(sent.json().status).toBe("sent");
    expect(sendGmailMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: preview.subject,
        html: preview.html,
        text: preview.text,
        inlineAttachments: [
          expect.objectContaining({
            contentBase64: bannerDataUrl.split(",")[1],
          }),
        ],
      }),
      expect.any(Object),
    );
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
  expect(await sendPartnerEmail(context, partnerId, legacyInput)).toEqual(
    first,
  );
  expect(mockReads).toEqual([requestPath]);
  await expect(
    sendPartnerEmail(context, partnerId, { ...args, templateVariant: 2 }),
  ).rejects.toMatchObject({ statusCode: 409 });
  expect(sendGmailMessage).toHaveBeenCalledTimes(1);
});

it("rejects a snake-case template alias in persisted delivery commands", async () => {
  const args = await input(2);
  await sendPartnerEmail(context, partnerId, args);
  const stored = mockDocs.get(requestPath)!;
  stored.template_variant = stored.templateVariant;
  delete stored.templateVariant;
  await expect(
    sendPartnerEmail(context, partnerId, args),
  ).rejects.toMatchObject({ statusCode: 409 });
  expect(sendGmailMessage).toHaveBeenCalledTimes(1);
});

function seedHistory(
  index: number,
  status: "sent" | "sending" | "unknown" | "failed" = "sent",
) {
  const id = `${index.toString(16).padStart(8, "0")}-1111-4111-8111-111111111111`;
  const createdAt = "2026-11-11T12:00:00.000Z";
  mockDocs.set(`${PARTNER_EMAIL_SENDS_COLLECTION}/${id}`, {
    requestId: id,
    partnerId,
    language: "es",
    templateVariant: 2,
    previewHash: "a".repeat(64),
    to: "ana@example.com",
    status,
    createdAt,
    updatedAt: createdAt,
    sentAt: status === "sent" ? createdAt : null,
    requestedByEmail: context.email,
    historySnapshot: {
      partnerName: `Company ${index}`,
      from: "federico@goldencrowvs.com",
      subject: `Subject ${index}`,
      category: "noOrganization",
      messageText: `Historical body ${index}`,
      accessKeyOmitted: false,
    },
  });
  return id;
}

it("paginates 20 projected history summaries and resumes equal-time rows even after deleting the cursor's record", async () => {
  const ids = Array.from({ length: 25 }, (_, index) => seedHistory(index + 1));
  mockDocs.delete(partnerPath);
  const first = await listPartnerEmailHistory(context);
  expect(first.emails.map((email) => email.requestId)).toEqual(
    ids.slice(5).reverse(),
  );
  expect(first.nextCursor).toMatch(/^pel1\./);
  expect(JSON.stringify(first)).not.toContain("Historical body");
  expect(first.emails[0]).toMatchObject({
    from: "federico@goldencrowvs.com",
    subject: "Subject 25",
    partnerName: "Company 25",
    messageAvailable: true,
  });
  mockDocs.delete(`${PARTNER_EMAIL_SENDS_COLLECTION}/${ids[5]}`);
  const second = await listPartnerEmailHistory(context, {
    cursor: first.nextCursor!,
  });
  expect(second.emails.map((email) => email.requestId)).toEqual(
    ids.slice(0, 5).reverse(),
  );
  expect(second.nextCursor).toBeNull();
  expect(mockQueries).toHaveLength(2);
  for (const query of mockQueries) {
    expect(query.limit).toBe(21);
    expect(query.orders).toEqual([
      ["updatedAt", "desc"],
      ["__name__", "desc"],
    ]);
    expect(query.fields).not.toContain("historySnapshot.messageText");
    expect(query.fields).toContain("historySnapshot.subject");
  }
  expect(mockReads).toHaveLength(0);
  expect(sendGmailMessage).not.toHaveBeenCalled();
});

it.each(["sent", "sending", "unknown", "failed"] as const)(
  "shows historical %s commands honestly without inventing an old sender or message",
  async (status) => {
    const id = seedHistory(1, status);
    const stored = mockDocs.get(`${PARTNER_EMAIL_SENDS_COLLECTION}/${id}`)!;
    delete stored.historySnapshot;
    delete stored.templateVariant;
    const { emails } = await listPartnerEmailHistory(context);
    expect(emails[0]).toMatchObject({
      requestId: id,
      status,
      from: null,
      subject: null,
      partnerName: null,
      templateVariant: null,
      messageAvailable: false,
    });
    expect((await getPartnerEmailHistory(context, id)).messageText).toBeNull();
    expect(sendGmailMessage).not.toHaveBeenCalled();
  },
);

it("retains the frozen sent message after partner edits or deletion, using one detail read", async () => {
  const args = await input(2);
  const reviewed = await previewPartnerEmail(
    context,
    partnerId,
    "es",
    undefined,
    2,
  );
  await sendPartnerEmail(context, partnerId, args);
  mockDocs.delete(partnerPath);
  mockReads.length = 0;
  const email = await getPartnerEmailHistory(context, requestId);
  expect(email).toMatchObject({
    messageText: reviewed.text,
    subject: reviewed.subject,
    partnerName: partner.companyName,
    from: reviewed.from,
    templateVariant: 2,
    status: "sent",
  });
  expect(mockReads).toEqual([requestPath]);
  expect(sendGmailMessage).toHaveBeenCalledTimes(1);
});

it("requires GOD MODE for every history operation before any data read", async () => {
  const regular = { ...context, isBootstrap: false };
  await expect(listPartnerEmailHistory(regular)).rejects.toMatchObject({
    statusCode: 403,
  });
  await expect(
    getPartnerEmailHistory(regular, requestId),
  ).rejects.toMatchObject({ statusCode: 403 });
  expect(mockReads).toHaveLength(0);
  expect(mockQueries).toHaveLength(0);
});

it("protects history routes and bounds cursors, limits and detail IDs", async () => {
  for (const [admin, status] of [
    [null, 401],
    [{ ...context, isBootstrap: false }, 403],
  ] as const) {
    const app = await server(admin);
    for (const suffix of ["", `/${requestId}`]) {
      expect(
        (
          await app.inject({
            method: "GET",
            url: `/admin/connected-partners/sent-email-log${suffix}`,
          })
        ).statusCode,
      ).toBe(status);
    }
    await app.close();
  }
  const id = seedHistory(1);
  const app = await server();
  try {
    const list = await app.inject({
      method: "GET",
      url: "/admin/connected-partners/sent-email-log?limit=20",
    });
    expect(list.statusCode).toBe(200);
    expect(list.headers["cache-control"]).toBe("private, no-store");
    expect(list.json().emails[0].requestId).toBe(id);
    for (const query of [
      "limit=0",
      "limit=21",
      "cursor=anything",
      "cursor=pel1.abc!",
      "limit=2.5",
      "page=2",
    ]) {
      expect(
        (
          await app.inject({
            method: "GET",
            url: `/admin/connected-partners/sent-email-log?${query}`,
          })
        ).statusCode,
      ).toBe(400);
    }
    expect(
      (
        await app.inject({
          method: "GET",
          url: "/admin/connected-partners/sent-email-log/invalid",
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await app.inject({
          method: "GET",
          url: `/admin/connected-partners/sent-email-log/${requestId}`,
        })
      ).statusCode,
    ).toBe(404);
    const detail = await app.inject({
      method: "GET",
      url: `/admin/connected-partners/sent-email-log/${id}`,
    });
    expect(detail.statusCode).toBe(200);
    expect(detail.json().email.messageText).toBe("Historical body 1");
  } finally {
    await app.close();
  }
});

it("rejects noncanonical nested history keys instead of accepting alternate spellings", async () => {
  const id = seedHistory(1);
  const snapshot = mockDocs.get(`${PARTNER_EMAIL_SENDS_COLLECTION}/${id}`)!
    .historySnapshot as Data;
  snapshot.message_text = snapshot.messageText;
  delete snapshot.messageText;
  await expect(getPartnerEmailHistory(context, id)).rejects.toMatchObject({
    statusCode: 409,
  });
});

it("places a later retry at the top of history instead of ordering by the original request time", async () => {
  const older = seedHistory(1);
  const newer = seedHistory(2);
  mockDocs.get(`${PARTNER_EMAIL_SENDS_COLLECTION}/${older}`)!.updatedAt =
    "2026-11-12T12:00:00.000Z";
  const page = await listPartnerEmailHistory(context);
  expect(page.emails.map((email) => email.requestId)).toEqual([older, newer]);
});
