export const PGO_PDF_DOWNLOAD_URL_ERROR =
  "Download URL must be a valid HTTPS URL and have a .pdf extension.";

export function isValidPgoPdfDownloadUrl(value: unknown) {
  if (typeof value !== "string" || value.trim() !== value) {
    return false;
  }

  try {
    const parsed = new URL(value);
    return (
      parsed.protocol === "https:" &&
      Boolean(parsed.hostname) &&
      parsed.pathname.toLowerCase().endsWith(".pdf")
    );
  } catch {
    return false;
  }
}

export function isPgoPdfDownloadUrlSchemaError(message: string) {
  return (
    /download[_ ]url/i.test(message) &&
    (/pgo_pdf_report/i.test(message) || /\.pdf/i.test(message)) &&
    /(pattern|format|valid|extension|ending)/i.test(message)
  );
}
