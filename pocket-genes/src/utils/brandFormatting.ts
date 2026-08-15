const RAREFRIENDS_PATTERN = /RareFriends(?:™)?/g;
const GOLDEN_CROW_VENTURE_STUDIO_PATTERN = /Golden Crow Venture Studio/g;

export function escapeHtml(value: string | number | null | undefined): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function formatBrandHtml(value: string | number | null | undefined): string {
  return String(value ?? '')
    .replace(RAREFRIENDS_PATTERN, (match) => `<em class="pg-brand-name">${match}</em>`)
    .replace(GOLDEN_CROW_VENTURE_STUDIO_PATTERN, (match) => `<em class="pg-brand-name">${match}</em>`);
}

export function formatBrandText(value: string | number | null | undefined): string {
  return formatBrandHtml(escapeHtml(value));
}
