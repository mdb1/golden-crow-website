import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DIST, loadPage } from '../support/dist.mjs';

const organizationPages = [
  {
    page: 'pocket-genes/discover/organizations/index.html',
    websiteLabel: 'Abrir sitio web',
  },
  {
    page: 'en/pocket-genes/discover/organizations/index.html',
    websiteLabel: 'Open website',
  },
];

test('organization profiles render a localized website action instead of the raw URL', () => {
  for (const { page, websiteLabel } of organizationPages) {
    const { html, root } = loadPage(page);
    const websiteAction = root.querySelector('[data-preview-website]');

    assert.equal(websiteAction?.text.trim(), websiteLabel);
    assert.match(html, /websiteLabel:\s*copy\.openWebsite/);
  }
});

test('the desktop organization action rail starts beside the identity block', () => {
  const { root } = loadPage(organizationPages[0].page);
  const componentStylesheet = root
    .querySelectorAll('link[rel="stylesheet"]')
    .map((link) => link.getAttribute('href'))
    .find((href) => href?.includes('PocketGenesAppLinkRedirect'));

  assert.ok(componentStylesheet, 'organization profile stylesheet is missing');
  const css = fs.readFileSync(path.join(DIST, componentStylesheet), 'utf8');

  assert.match(css, /grid-template:"banner banner""identity actions""description facts"/);
  assert.doesNotMatch(css, /"identity identity""description actions"/);
});
