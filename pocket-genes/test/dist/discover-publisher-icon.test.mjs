import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadPage } from '../support/dist.mjs';

const discoverPages = [
  'pocket-genes/discover/index.html',
  'en/pocket-genes/discover/index.html',
];

const feedEntryPages = [
  'pocket-genes/discover/feed_entries/index.html',
  'en/pocket-genes/discover/feed_entries/index.html',
];

test('Discover cards use the uploaded publisher logo when its URL is empty', () => {
  for (const page of discoverPages) {
    const { html } = loadPage(page);

    assert.match(
      html,
      /imageSource\(publisherSnapshot\.imageUrl\)\s*\|\|\s*imageSource\(publisherSnapshot\.imageUploadDataUrl\)/
    );
    assert.doesNotMatch(html, /documents:batchGet/);
  }
});

test('feed entry details prefer publisher snapshots and never substitute the app icon', () => {
  for (const page of feedEntryPages) {
    const { html } = loadPage(page);

    assert.match(
      html,
      /imageSource\(fields\.publisherSnapshot\?\.imageUrl\)\s*\|\|\s*imageSource\(fields\.publisherSnapshot\?\.imageUploadDataUrl\)/
    );
    assert.match(html, /imageUrl:\s*publisherImage,\s*bannerUrl:/);
    assert.doesNotMatch(html, /imageUrl:\s*publisherImage\s*\|\|/);
    assert.match(
      html,
      /resource === 'feed_entries' && !previewData\.imageUrl[\s\S]*?fetchPublisherImage\(fields\)/
    );
    assert.match(
      html,
      /imageSource\(publisherFields\.imageUrl\)\s*\|\|\s*imageSource\(publisherFields\.imageUploadDataUrl\)/
    );
  }
});
