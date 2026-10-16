import { PDFDocument } from "pdf-lib";
import {
  applySignatureToConsentPdf,
  applySignaturesToConsentPdf,
} from "@/lib/consent-pdf";

const ONE_PIXEL_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

describe("consent PDF signing", () => {
  it("embeds the signature only on the last page", async () => {
    const source = await PDFDocument.create();
    source.addPage([596, 842]);
    source.addPage([596, 842]);
    source.addPage([596, 842]);

    const signedBytes = await applySignatureToConsentPdf(
      await source.save(),
      ONE_PIXEL_PNG,
      { x: 0.72, y: 0.445, width: 0.16 },
    );
    const signed = await PDFDocument.load(signedBytes);

    expect(signed.getPageCount()).toBe(3);
    expect(signed.getPage(0).node.Contents()).toBeUndefined();
    expect(signed.getPage(1).node.Contents()).toBeUndefined();
    expect(signed.getPage(2).node.Contents()).toBeDefined();
    expect(signedBytes.byteLength).toBeGreaterThan(0);
  });

  it("rejects non-PNG signature data", async () => {
    const source = await PDFDocument.create();
    source.addPage([596, 842]);

    await expect(
      applySignatureToConsentPdf(
        await source.save(),
        "data:image/jpeg;base64,invalid",
        { x: 0, y: 0, width: 0.16 },
      ),
    ).rejects.toThrow("The signature must be a PNG data URL.");
  });

  it("embeds the patient document, signing date, names and signatures in one PDF", async () => {
    const source = await PDFDocument.create();
    source.addPage([596, 842]);
    source.addPage([596, 842]);

    const signedBytes = await applySignaturesToConsentPdf(await source.save(), [
      {
        role: "patient",
        name: "Ada Paciente",
        document: "31.234.567",
        signatureDate: "16/10/2026",
        signatureDataUrl: ONE_PIXEL_PNG,
        placement: { x: 0.72, y: 0.445, width: 0.16 },
      },
      {
        role: "partner",
        name: "Alex Pareja",
        signatureDate: "16/10/2026",
        signatureDataUrl: ONE_PIXEL_PNG,
        placement: { x: 0.72, y: 0.64, width: 0.16 },
      },
    ]);
    const signed = await PDFDocument.load(signedBytes);

    expect(signed.getPageCount()).toBe(2);
    expect(signedBytes.byteLength).toBeGreaterThan(0);
  });

  it("requires a name for every signer", async () => {
    const source = await PDFDocument.create();
    source.addPage([596, 842]);

    await expect(
      applySignaturesToConsentPdf(await source.save(), [
        {
          role: "patient",
          name: " ",
          signatureDataUrl: ONE_PIXEL_PNG,
          placement: { x: 0, y: 0, width: 0.16 },
        },
      ]),
    ).rejects.toThrow("Every signer must have a name.");
  });
});
