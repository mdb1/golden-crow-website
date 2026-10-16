export const CONSENT_TEMPLATE_URL =
  "/patient-portal/documents/consentimiento-informado-2pq.pdf";

export const CONSENT_TEMPLATE_PREVIEW_URLS = [
  "/patient-portal/documents/consentimiento-informado-2pq-pagina-1.png",
  "/patient-portal/documents/consentimiento-informado-2pq-pagina-2.png",
] as const;

export const SIGNED_CONSENT_FILE_NAME =
  "consentimiento-informado-2pq-firmado.pdf";

export type ConsentSignaturePlacement = {
  pageIndex: number;
  x: number;
  y: number;
  width: number;
};

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum);
}

export async function applySignatureToConsentPdf(
  templateBytes: ArrayBuffer | Uint8Array,
  signatureDataUrl: string,
  placement: ConsentSignaturePlacement,
) {
  if (!signatureDataUrl.startsWith("data:image/png;base64,")) {
    throw new Error("The signature must be a PNG data URL.");
  }

  const { PDFDocument } = await import("pdf-lib");
  const pdf = await PDFDocument.load(templateBytes);
  const pages = pdf.getPages();
  if (pages.length === 0) {
    throw new Error("The consent PDF has no pages.");
  }

  const pageIndex = Math.round(clamp(placement.pageIndex, 0, pages.length - 1));
  const page = pages[pageIndex];
  const signature = await pdf.embedPng(signatureDataUrl);
  const pageWidth = page.getWidth();
  const pageHeight = page.getHeight();
  const signatureWidth = pageWidth * clamp(placement.width, 0.08, 0.5);
  const signatureHeight = signatureWidth * (signature.height / signature.width);
  const x = clamp(
    placement.x * pageWidth,
    0,
    Math.max(0, pageWidth - signatureWidth),
  );
  const top = clamp(
    placement.y * pageHeight,
    0,
    Math.max(0, pageHeight - signatureHeight),
  );

  page.drawImage(signature, {
    x,
    y: pageHeight - top - signatureHeight,
    width: signatureWidth,
    height: signatureHeight,
  });

  return pdf.save();
}

export function bytesToPdfDataUrl(bytes: Uint8Array) {
  const chunkSize = 0x8000;
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(
      ...bytes.subarray(offset, Math.min(offset + chunkSize, bytes.length)),
    );
  }
  return `data:application/pdf;base64,${btoa(binary)}`;
}
