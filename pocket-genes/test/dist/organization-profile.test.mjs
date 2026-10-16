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

test('organization banners render inside the main content after the description', () => {
  for (const { page } of organizationPages) {
    const { root } = loadPage(page);
    const preview = root.querySelector('#shared-preview');
    const main = preview?.querySelector('.organization-profile-main');
    const description = main?.querySelector('.organization-profile-description');
    const banner = main?.querySelector('[data-preview-banner-shell]');

    assert.ok(preview, `${page} organization preview is missing`);
    assert.ok(main, `${page} organization main content is missing`);
    assert.ok(description, `${page} organization description is missing`);
    assert.ok(banner, `${page} organization banner is missing`);
    assert.equal(description.parentNode, main, `${page} description must be a direct child of the main content`);
    assert.equal(banner.parentNode, main, `${page} banner must be a direct child of the main content`);
    assert.notEqual(banner.parentNode, preview, `${page} banner must not be a top-level preview block`);
    assert.ok(
      main.childNodes.indexOf(description) < main.childNodes.indexOf(banner),
      `${page} banner must follow the description`,
    );
  }
});

test('the desktop organization grid keeps the banner out of the full-width top row', () => {
  const { root } = loadPage(organizationPages[0].page);
  const componentStylesheet = root
    .querySelectorAll('link[rel="stylesheet"]')
    .map((link) => link.getAttribute('href'))
    .find((href) => href?.includes('PocketGenesAppLinkRedirect'));

  assert.ok(componentStylesheet, 'organization profile stylesheet is missing');
  const css = fs.readFileSync(path.join(DIST, componentStylesheet), 'utf8');

  assert.match(css, /grid-template:"identity actions""main facts"/);
  assert.doesNotMatch(css, /"banner banner"/);
  assert.doesNotMatch(css, /grid-area:banner/);
});
