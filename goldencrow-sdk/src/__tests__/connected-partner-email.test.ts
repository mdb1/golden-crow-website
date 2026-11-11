import { buildConnectedPartnerEmail } from "../lib/connected-partner-email.js";
import type { Partner } from "../contracts/connected-partners.js";

const base: Partner = {
  id: "partner_one",
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
  linkedOrganization: null,
  linkedIndividualPublisher: null,
  linkedApp: null,
  linkedOrganizationSnapshot: null,
  linkedIndividualPublisherSnapshot: null,
  linkedAppSnapshot: null,
};
const org = { id: "org_one", name: "Current Organization" };
const individual = { id: "individual_one", name: "Dr. Rivera" };
const withOrg: Partner = {
  ...base,
  linkedOrganizationId: org.id,
  linkedOrganization: org,
};
function withApp(status: NonNullable<Partner["linkedApp"]>["status"]): Partner {
  return {
    ...withOrg,
    linkedAppId: "app_one",
    linkedApp: {
      id: "app_one",
      publisherKind: "organization",
      publisherId: org.id,
      publisherName: org.name,
      status,
      appProviderIdentifier: "app_genome",
    },
  };
}
function callback(partner: Partner) {
  return new URL(buildConnectedPartnerEmail(partner).ctaUrl).searchParams.get(
    "callbackUrl",
  );
}

it("invites unlinked partners to the exact public form with approval, discounts, network and free sample copy", () => {
  const preview = buildConnectedPartnerEmail(base);
  expect(preview.to).toBe(base.email);
  expect(preview.category).toBe("noOrganization");
  expect(preview.language).toBe("es");
  expect(preview.ctaUrl).toBe(
    "https://goldencrowvs.com/pocket-genes/join-us/new/",
  );
  for (const phrase of [
    "descuentos disponibles",
    "organizaciones y profesionales",
    "muestra gratuita de tu propia app",
    "revisará la solicitud",
    "cuando sea aprobada",
  ])
    expect(preview.text).toContain(phrase);
  expect(preview.html).toContain("background:#2d1b69");
  expect(preview.html).toContain("background:#6f3cc3");
  expect(preview.html).toContain(preview.ctaUrl);
  expect(preview.text).not.toContain("clave de acceso:");
});

it("deep-links existing publishers without apps through their own portal login to the new app form", () => {
  const preview = buildConnectedPartnerEmail(withOrg);
  const url = new URL(preview.ctaUrl);
  expect(url.pathname).toBe("/publisher-portal/login");
  expect(url.searchParams.get("email")).toBe(base.email);
  expect(callback(withOrg)).toBe("/publisher-portal/app/new");
  expect(preview.text).toContain(org.name);
  expect(preview.text).toContain("plataformas, funciones y colores");
  expect(preview.text).toContain(
    `Usá la cuenta de publicador que administra ${org.name}.`,
  );
});

it("uses current testing status rather than a historical contract snapshot to request publication", () => {
  const partner = withApp("active_for_testing");
  partner.linkedAppSnapshot = { ...partner.linkedApp!, status: "active" };
  const preview = buildConnectedPartnerEmail(partner);
  expect(preview.category).toBe("freeApp");
  expect(callback(partner)).toBe(
    "/publisher-portal/app/accept-terms-and-conditions",
  );
  expect(preview.text).toContain("muestra gratuita para pruebas");
  expect(preview.text).toContain(
    "aceptar las condiciones y solicitar la publicación",
  );
  expect(preview.text).toContain("información de pago");
});

it.each([
  "active_waiting_for_payment",
  "active_waiting_for_upload",
  "active",
] as const)(
  "invites contracted %s apps to manage their app in the portal",
  (status) => {
    const partner = withApp(status);
    partner.linkedAppSnapshot = {
      ...partner.linkedApp!,
      status: "active_for_testing",
    };
    const preview = buildConnectedPartnerEmail(partner);
    expect(preview.category).toBe("contract");
    expect(callback(partner)).toBe("/publisher-portal/app/edit");
    expect(preview.ctaLabel).toBe("Gestionar mi app");
    expect(preview.text).toContain(
      "Podés gestionar la app de Current Organization",
    );
    expect(preview.text).not.toContain("está activa en la etapa");
  },
);

it("supports individual-only publishers and both publisher links without sending an organization invitation", () => {
  const partner = {
    ...base,
    linkedIndividualPublisherId: individual.id,
    linkedIndividualPublisher: individual,
  };
  expect(buildConnectedPartnerEmail(partner).category).toBe(
    "individualWithoutApp",
  );
  expect(callback(partner)).toBe("/publisher-portal/app/new");
  const appPartner: Partner = {
    ...partner,
    linkedAppId: "individual_app",
    linkedApp: {
      id: "individual_app",
      publisherKind: "individual",
      publisherId: individual.id,
      publisherName: individual.name,
      status: "active_for_testing",
    },
  };
  expect(buildConnectedPartnerEmail(appPartner).category).toBe(
    "individualFreeApp",
  );
  const both = {
    ...appPartner,
    linkedOrganizationId: org.id,
    linkedOrganization: org,
  };
  expect(buildConnectedPartnerEmail(both).category).toBe("freeApp");
  expect(buildConnectedPartnerEmail(both).text).toContain(individual.name);
});

it.each([
  { ...withOrg, linkedOrganization: null },
  { ...withApp("active_for_testing"), linkedApp: null },
  {
    ...withApp("active_for_testing"),
    linkedApp: {
      ...withApp("active_for_testing").linkedApp!,
      publisherId: "wrong_owner",
    },
  },
  withApp("pending_revision"),
])(
  "rejects unavailable, mismatched or nonactive live links even when snapshots look usable",
  (partner) => {
    const saved = {
      ...partner,
      linkedOrganizationSnapshot: org,
      linkedAppSnapshot: withApp("active_for_testing").linkedApp,
    };
    expect(() => buildConnectedPartnerEmail(saved)).toThrow(
      "Review the partner's missing connections or app status",
    );
  },
);

it("escapes contact and publisher data and binds rendered message, language, recipient and live app identity into its hash", () => {
  const partner = {
    ...withApp("active_for_testing"),
    firstName: '<img src=x onerror="alert(1)">',
    linkedApp: {
      ...withApp("active_for_testing").linkedApp!,
      publisherName: "<script>alert(1)</script>",
    },
  };
  const preview = buildConnectedPartnerEmail(partner);
  expect(preview.html).not.toContain("<script>alert(1)</script>");
  expect(preview.html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  expect(preview.html).not.toContain("<img src=x");
  expect(preview.previewHash).toMatch(/^[a-f0-9]{64}$/);
  expect(buildConnectedPartnerEmail(partner).previewHash).toBe(
    preview.previewHash,
  );
  for (const change of [
    { ...partner, email: "other@example.com" },
    {
      ...partner,
      linkedAppId: "different_app",
      linkedApp: { ...partner.linkedApp, id: "different_app" },
    },
    {
      ...partner,
      linkedOrganization: { ...org, name: "Renamed Organization" },
    },
  ])
    expect(buildConnectedPartnerEmail(change).previewHash).not.toBe(
      preview.previewHash,
    );
  expect(buildConnectedPartnerEmail(partner, "en").previewHash).not.toBe(
    preview.previewHash,
  );
  expect(buildConnectedPartnerEmail(base, "en").text).toContain(
    "available network discounts",
  );
});

it("keeps the desktop invitation frame and gives narrow email clients readable padding, headings and wrapping CTAs", () => {
  const preview = buildConnectedPartnerEmail(
    withApp("active_waiting_for_upload"),
  );
  expect(preview.html).toContain("@media only screen and (max-width:480px)");
  expect(preview.html).toContain(
    ".pg-email-outer { padding:20px 8px !important; }",
  );
  expect(preview.html).toContain(
    ".pg-email-header, .pg-email-content { padding:28px 24px !important; }",
  );
  expect(preview.html).toContain(
    ".pg-email-title { font-size:28px !important; line-height:34px !important; }",
  );
  expect(preview.html).toContain(
    'class="pg-email-header" style="background:#2d1b69;padding:36px 40px;',
  );
  expect(preview.html).toContain(
    'class="pg-email-content" style="padding:40px;',
  );
  expect(preview.html).toContain(
    "max-width:100%;box-sizing:border-box;text-align:center;overflow-wrap:break-word",
  );
});
