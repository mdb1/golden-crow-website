import { PDFDocument } from "pdf-lib";
import { applySignatureToConsentPdf } from "@/lib/consent-pdf";

const ONE_PIXEL_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

describe("consent PDF signing", () => {
  it("embeds the signature without changing the page count", async () => {
    const source = await PDFDocument.create();
    source.addPage([596, 842]);
    source.addPage([596, 842]);

    const signedBytes = await applySignatureToConsentPdf(
      await source.save(),
      ONE_PIXEL_PNG,
      { pageIndex: 1, x: 0.72, y: 0.445, width: 0.16 },
    );
    const signed = await PDFDocument.load(signedBytes);

    expect(signed.getPageCount()).toBe(2);
    expect(signedBytes.byteLength).toBeGreaterThan(0);
  });

  it("rejects non-PNG signature data", async () => {
    const source = await PDFDocument.create();
    source.addPage([596, 842]);

    await expect(
      applySignatureToConsentPdf(
        await source.save(),
        "data:image/jpeg;base64,invalid",
        { pageIndex: 0, x: 0, y: 0, width: 0.16 },
      ),
    ).rejects.toThrow("The signature must be a PNG data URL.");
  });
});
