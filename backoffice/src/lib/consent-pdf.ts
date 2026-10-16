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

export type ConsentSignerRole = "patient" | "partner";

export type ConsentPdfSigner = {
  role: ConsentSignerRole;
  name: string;
  document?: string;
  signatureDataUrl: string;
  placement: ConsentSignaturePlacement;
};

export const CONSENT_SIGNER_NAME_PLACEMENTS: Record<
  ConsentSignerRole,
  { pageIndex: number; x: number; baselineFromTop: number; maxWidth: number }
> = {
  patient: {
    pageIndex: 1,
    x: 0.5,
    baselineFromTop: 0.466,
    maxWidth: 0.18,
  },
  partner: {
    pageIndex: 1,
    x: 0.5,
    baselineFromTop: 0.66,
    maxWidth: 0.18,
  },
};

export const CONSENT_SIGNER_DOCUMENT_PLACEMENTS: Record<
  ConsentSignerRole,
  { pageIndex: number; x: number; baselineFromTop: number; maxWidth: number }
> = {
  patient: {
    pageIndex: 1,
    x: 0.5,
    baselineFromTop: 0.532,
    maxWidth: 0.14,
  },
  partner: {
    pageIndex: 1,
    x: 0.5,
    baselineFromTop: 0.727,
    maxWidth: 0.14,
  },
};

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum);
}

function fitTextSize(
  font: { widthOfTextAtSize: (text: string, size: number) => number },
  text: string,
  maxWidth: number,
) {
  let size = 9;
  while (size > 6 && font.widthOfTextAtSize(text, size) > maxWidth) {
    size -= 0.25;
  }
  return size;
}

export async function applySignaturesToConsentPdf(
  templateBytes: ArrayBuffer | Uint8Array,
  signers: ConsentPdfSigner[],
) {
  if (signers.length === 0) {
    throw new Error("At least one signer is required.");
  }

  for (const signer of signers) {
    if (!signer.name.trim()) {
      throw new Error("Every signer must have a name.");
    }
    if (!signer.signatureDataUrl.startsWith("data:image/png;base64,")) {
      throw new Error("The signature must be a PNG data URL.");
    }
  }

  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const pdf = await PDFDocument.load(templateBytes);
  const pages = pdf.getPages();
  if (pages.length === 0) {
    throw new Error("The consent PDF has no pages.");
  }

  const font = await pdf.embedFont(StandardFonts.Helvetica);

  for (const signer of signers) {
    const placement = signer.placement;
    const pageIndex = Math.round(
      clamp(placement.pageIndex, 0, pages.length - 1),
    );
    const page = pages[pageIndex];
    const signature = await pdf.embedPng(signer.signatureDataUrl);
    const pageWidth = page.getWidth();
    const pageHeight = page.getHeight();
    const signatureWidth = pageWidth * clamp(placement.width, 0.08, 0.5);
    const signatureHeight =
      signatureWidth * (signature.height / signature.width);
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

    const namePlacement = CONSENT_SIGNER_NAME_PLACEMENTS[signer.role];
    const namePage = pages[
      Math.round(clamp(namePlacement.pageIndex, 0, pages.length - 1))
    ];
    const namePageWidth = namePage.getWidth();
    const namePageHeight = namePage.getHeight();
    const name = signer.name.trim();
    const fontSize = fitTextSize(
      font,
      name,
      namePageWidth * namePlacement.maxWidth,
    );

    namePage.drawText(name, {
      x: namePageWidth * namePlacement.x,
      y: namePageHeight * (1 - namePlacement.baselineFromTop),
      size: fontSize,
      font,
      color: rgb(0.07, 0.09, 0.13),
      maxWidth: namePageWidth * namePlacement.maxWidth,
    });

    const document = signer.document?.trim();
    if (document) {
      const documentPlacement =
        CONSENT_SIGNER_DOCUMENT_PLACEMENTS[signer.role];
      const documentPage = pages[
        Math.round(clamp(documentPlacement.pageIndex, 0, pages.length - 1))
      ];
      const documentPageWidth = documentPage.getWidth();
      const documentPageHeight = documentPage.getHeight();
      const documentFontSize = fitTextSize(
        font,
        document,
        documentPageWidth * documentPlacement.maxWidth,
      );

      documentPage.drawText(document, {
        x: documentPageWidth * documentPlacement.x,
        y: documentPageHeight * (1 - documentPlacement.baselineFromTop),
        size: documentFontSize,
        font,
        color: rgb(0.07, 0.09, 0.13),
        maxWidth: documentPageWidth * documentPlacement.maxWidth,
      });
    }
  }

  return pdf.save();
}

export async function applySignatureToConsentPdf(
  templateBytes: ArrayBuffer | Uint8Array,
  signatureDataUrl: string,
  placement: ConsentSignaturePlacement,
) {
  return applySignaturesToConsentPdf(templateBytes, [
    {
      role: "patient",
      name: "Paciente",
      signatureDataUrl,
      placement,
    },
  ]);
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
