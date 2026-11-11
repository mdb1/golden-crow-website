import { buildConnectedPartnerEmail } from "../lib/connected-partner-email.js";
import type { Partner } from "../contracts/connected-partners.js";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { partnerBannerBrand } from "../lib/partner-email-banner.js";

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

it("includes the supplied access code only on publisher login links and escapes it in HTML", () => {
  const key = "test+key&value";
  const preview = buildConnectedPartnerEmail(withOrg, "es", key);
  const url = new URL(preview.ctaUrl);
  expect(url.searchParams.get("accessKey")).toBe(key);
  expect(url.searchParams.get("email")).toBe(withOrg.email);
  expect(url.searchParams.get("callbackUrl")).toBe("/publisher-portal/app/new");
  expect(preview.text).toContain(preview.ctaUrl);
  expect(preview.html).toContain("&amp;accessKey=");
  expect(buildConnectedPartnerEmail(base, "es", key).ctaUrl).toBe("https://goldencrowvs.com/pocket-genes/join-us/new/");
});
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

it("invites unlinked partners to the exact public form with approval, discounts, network and a branded demo", () => {
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
    `demo gratuita de una app con la identidad de ${base.companyName}`,
    "Revisaremos la solicitud",
    "si es aprobada",
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
    `Entrá con la cuenta de publicador de ${org.name} y empezá.`,
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
  expect(preview.text).toContain(
    `La demo gratuita de la app de ${org.name} ya está disponible para probar.`,
  );
  expect(preview.text).toContain("aceptarlos y solicitar la publicación");
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
    expect(preview.ctaLabel).toBe("Abrir el portal de mi app");
    expect(preview.text).toContain(
      "La app de Current Organization tiene su espacio de gestión.",
    );
    expect(preview.text).not.toContain("está activa en la etapa");
  },
);

it.each([
  ["es", "Hola Ana,"],
  ["en", "Hi Ana,"],
] as const)(
  "personalizes the %s greeting with only the contact's first name",
  (language, greeting) => {
    for (const partner of [
      base,
      withOrg,
      withApp("active_for_testing"),
      withApp("active"),
    ]) {
      expect(
        buildConnectedPartnerEmail(partner, language).text.split("\n")[0],
      ).toBe(greeting);
    }
  },
);

it("uses the approved inbox preheader separately from the body lead and gives each stage its own closing", () => {
  const partners = [
    base,
    withOrg,
    withApp("active_for_testing"),
    withApp("active"),
  ];
  for (const language of ["es", "en"] as const) {
    const closings = new Set<string>();
    for (const partner of partners) {
      const preview = buildConnectedPartnerEmail(partner, language);
      const blocks = preview.text.split("\n\n");
      const preheader = preview.html.match(
        /<div style="display:none;[^>]*>([^<]*)<\/div>/,
      )?.[1];
      expect(preheader).toBeTruthy();
      expect(preheader).not.toBe(blocks[2]);
      closings.add(blocks[blocks.length - 2]!);
    }
    expect(closings.size).toBe(4);
  }
  expect(buildConnectedPartnerEmail(base).html).toContain(
    ">Explorá posibles alianzas, descuentos de la red y una demo gratuita de tu propia app.</div>",
  );
});

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

it("matches all approved Spanish and English template wording in the supplied table", () => {
  const partners: Record<string, Partner> = { "Sin organización todavía": base, "Sin app": withOrg, "Con app gratuita": withApp("active_for_testing"), "Con contrato": withApp("active") };
  const rows = readFileSync(join(process.cwd(), "docs/partner-email-templates.tsv"), "utf8").trimEnd().split("\n").slice(1);
  const interpolate = (value: string) => value.replaceAll("{firstName}", base.firstName).replaceAll("{companyName}", base.companyName).replaceAll("{publisherName}", org.name);
  for (const row of rows) {
    const [template, field, es, en] = row.split("\t");
    for (const [language, copy] of [["es", es], ["en", en]] as const) {
      const preview = buildConnectedPartnerEmail(partners[template!]!, language);
      const expected = interpolate(copy!);
      if (field === "subject") expect(preview.subject).toBe(expected);
      else if (field === "button_text") expect(preview.ctaLabel).toBe(expected);
      else if (field === "brand" || field === "preheader") expect(preview.html).toContain(expected);
      else if (field !== "button_url") expect(preview.text).toContain(expected);
    }
  }
});

it("places the actual inline banner and a prominent purple action above the explanatory paragraphs", () => {
  const brand = partnerBannerBrand(org.name, "#657960", "https://example.com/logo.png", "es", "Pedir mi demo gratis");
  const banner = { contextHash: brand.contextHash, dataUrl: "data:image/jpeg;base64,reviewed-image" };
  const preview = buildConnectedPartnerEmail(withOrg, "es", "KEY12345", { brand, banner });
  expect(preview.html).toContain('src="cid:partner-publisher-app-banner"');
  expect(preview.html).toContain(`alt="Así podría verse la app de ${org.name}"`);
  expect(preview.html.indexOf('class="pg-email-cta"')).toBeLessThan(preview.html.indexOf("Elegí las plataformas"));
  expect(preview.html).toContain("padding:22px 24px");
  expect(buildConnectedPartnerEmail(withOrg, "es", "KEY12345", { brand, banner: { ...banner, dataUrl: "data:image/jpeg;base64,changed-image" } }).previewHash).not.toBe(preview.previewHash);
  expect(buildConnectedPartnerEmail(base).bannerBrand).toBeUndefined();
});

it("uses the live banner publisher name in copy even if the app carries an older publisher name", () => {
  const partner = withApp("active_for_testing");
  partner.linkedApp!.publisherName = "Previous publisher name";
  const brand = partnerBannerBrand("Current publisher name", "#657960", "", "es", "Revisar condiciones de publicación");
  const preview = buildConnectedPartnerEmail(partner, "es", undefined, { brand });
  expect(preview.subject).toBe("¿Listos para publicar la app de Current publisher name?");
  expect(preview.text).toContain("La demo gratuita de la app de Current publisher name");
  expect(preview.text).not.toContain("Previous publisher name");
});
