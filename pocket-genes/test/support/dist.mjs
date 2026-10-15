// Shared helpers for the tests that run over the BUILT site (`npm run build` → dist/).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'node-html-parser';

export const SITE = 'https://goldencrowvs.com';
export const DIST = fileURLToPath(new URL('../../dist/', import.meta.url));

if (!fs.existsSync(path.join(DIST, 'index.html'))) {
  throw new Error(`No built site at ${DIST}. Run \`npm run build\` before \`npm run test:dist\`.`);
}

/** Search-engine verification stubs and other non-site HTML at the root of public/. */
const NON_PAGES = new Set(['google36e5c824fdeb3a14.html']);

/** Every built HTML page, as a dist-relative POSIX path (e.g. `en/about/index.html`). */
export const pages = fs
  .readdirSync(DIST, { recursive: true })
  .map((file) => file.split(path.sep).join('/'))
  .filter((file) => file.endsWith('.html') && !NON_PAGES.has(file))
  .sort();

/** `en/about/index.html` → `/en/about/`. */
export function urlPathOf(page) {
  return `/${page.replace(/index\.html$/, '')}`;
}

export function localeOf(page) {
  return page.startsWith('en/') ? 'en' : 'es';
}

/** The same page in the other locale: `about/index.html` ⇄ `en/about/index.html`. */
export function counterpartOf(page) {
  return page.startsWith('en/') ? page.slice(3) : `en/${page}`;
}

const cache = new Map();
export function loadPage(page) {
  if (!cache.has(page)) {
    const html = fs.readFileSync(path.join(DIST, page), 'utf8');
    cache.set(page, { html, root: parse(html) });
  }
  return cache.get(page);
}

/**
 * Does a site-absolute pathname resolve to a file in dist, the way GitHub Pages serves it?
 * `/about/` → about/index.html, `/about` → about/index.html (Pages redirects), `/x.png` → x.png.
 */
export function resolvesInDist(pathname) {
  const target = path.join(DIST, decodeURIComponent(pathname));
  if (!target.startsWith(DIST)) return false;
  if (!fs.existsSync(target)) return false;
  if (fs.statSync(target).isFile()) return true;
  return fs.existsSync(path.join(target, 'index.html'));
}

/** Resolve an href/src as the browser would on `page`; null if it leaves the site. */
export function internalPathname(value, page) {
  const trimmed = value.trim();
  if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('//')) return null;
  const url = new URL(trimmed, `${SITE}${urlPathOf(page)}`);
  if (url.origin !== SITE) return null;
  return url.pathname;
}

export function isNoindex(root) {
  return /noindex/i.test(root.querySelector('meta[name="robots"]')?.getAttribute('content') ?? '');
}
