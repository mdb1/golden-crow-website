import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PartnerEmailBannerInputSchema, partnerBannerAttachment, partnerBannerBrand, partnerEmailDisplayName } from "../lib/partner-email-banner.js";
import { buildRawGmailMessage } from "../lib/gmail-mailer.js";

const jpeg = readFileSync(join(process.cwd(), "src/__tests__/support/partner-banner.jpg"));
const brand = partnerBannerBrand("Genome Studio", "#657960", "https://example.com/logo.png", "es", "Pedir mi demo gratis");
const banner = { contextHash: brand.contextHash, dataUrl: `data:image/jpeg;base64,${jpeg.toString("base64")}` };
it.each([
  ["  DNA Institute, Research — Genetics  ", "DNA Institute"],
  ["MedicGen — Centro de genética", "MedicGen"],
  ["MedicGen – Centro de genética", "MedicGen"],
  ["MedicGen - Centro de genética", "MedicGen"],
  ["MedicGen | Medicina genómica", "MedicGen"],
  ["MedicGen (Instituto de genética)", "MedicGen"],
  ["MedicGen: Medicina genética", "MedicGen"],
  ["MedicGen / Research", "MedicGen"],
  ["MedicGen，Investigación", "MedicGen"],
  ["Medicina Genómica Integral", "Medicina Genómica Integral"],
  [" Épsilon Genómica ", "Épsilon Genómica"],
  ["- MedicGen", "- MedicGen"],
  ["   ", "Tu marca"],
])("uses the banner's short display name for %s", (name, expected) => {
  expect(partnerEmailDisplayName(name)).toBe(expected);
});
it("shows the short name while binding the banner to the full live name", () => {
  const first = partnerBannerBrand("MedicGen — Centro de genética", brand.tint, brand.imageUrl, "es", "Demo");
  const changed = partnerBannerBrand("MedicGen — Nuevo nombre legal", brand.tint, brand.imageUrl, "es", "Demo");
  expect(first.name).toBe("MedicGen");
  expect(changed.name).toBe("MedicGen");
  expect(changed.contextHash).not.toBe(first.contextHash);
});
it("preserves an individual publisher's personal name", () => {
  expect(partnerEmailDisplayName(" Dr. Rivera ", "individual")).toBe("Dr. Rivera");
  expect(partnerBannerBrand("Dr. Rivera", brand.tint, brand.imageUrl, "es", "Demo", "individual").name).toBe("Dr. Rivera");
});
it("binds the banner to live name, icon, tint, language and action", () => {
  expect(partnerBannerBrand("Genome Studio", "#657960", "https://example.com/logo.png", "es", "Pedir mi demo gratis")).toEqual(brand);
  for (const next of [
    partnerBannerBrand("New name", brand.tint, brand.imageUrl, "es", "Pedir mi demo gratis"),
    partnerBannerBrand(brand.name, "#123456", brand.imageUrl, "es", "Pedir mi demo gratis"),
    partnerBannerBrand(brand.name, brand.tint, "https://example.com/new.png", "es", "Pedir mi demo gratis"),
    partnerBannerBrand(brand.name, brand.tint, brand.imageUrl, "en", "Request my free demo"),
  ]) expect(next.contextHash).not.toBe(brand.contextHash);
});
it("validates a bounded JPEG and embeds the reviewed bytes as an inline MIME image", () => {
  expect(PartnerEmailBannerInputSchema.parse(banner)).toEqual(banner);
  const attachment = partnerBannerAttachment(banner);
  const raw = Buffer.from(buildRawGmailMessage({ to: "ana@example.com", subject: "Demo", text: "Demo", html: `<img src="cid:${attachment.contentId}">`, inlineAttachments: [attachment] }, { from: "Pocket Genes <noreply@example.com>" }), "base64url").toString();
  expect(raw).toContain(`Content-ID: <${attachment.contentId}>`);
  expect(raw).toContain("Content-Type: image/jpeg");
  expect(raw.replace(/\r\n/g, "")).toContain(jpeg.toString("base64"));
});
it("rejects scripts, malformed bytes, oversized input and unsupported image dimensions", () => {
  expect(PartnerEmailBannerInputSchema.safeParse({ ...banner, dataUrl: "data:image/svg+xml,<svg onload=alert(1)>" }).success).toBe(false);
  expect(PartnerEmailBannerInputSchema.safeParse({ ...banner, dataUrl: "data:image/jpeg;base64," + "A".repeat(750001) }).success).toBe(false);
  expect(() => partnerBannerAttachment({ ...banner, dataUrl: "data:image/jpeg;base64,YQ==" })).toThrow();
  const huge = Buffer.from(jpeg);
  const frame = huge.indexOf(Buffer.from([0xff, 0xc0]));
  huge.writeUInt16BE(60000, frame + 7);
  expect(() => partnerBannerAttachment({ ...banner, dataUrl: `data:image/jpeg;base64,${huge.toString("base64")}` })).toThrow();
});
