import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  DESCRIPTION_MIN_LENGTH,
  getDescriptionProgress,
} from '../../src/data/discoverPublisherDescriptionProgress.ts';

test('publisher description progress moves through the requested color thresholds', () => {
  assert.deepEqual(getDescriptionProgress(0), {
    remaining: 30,
    progress: 0,
    state: 'needs-more',
  });
  assert.equal(getDescriptionProgress(19).state, 'needs-more');
  assert.equal(getDescriptionProgress(20).state, 'close');
  assert.equal(getDescriptionProgress(24).state, 'close');
  assert.equal(getDescriptionProgress(25).state, 'almost-there');
  assert.equal(getDescriptionProgress(29).state, 'almost-there');
  assert.equal(getDescriptionProgress(DESCRIPTION_MIN_LENGTH).state, 'ready');
});

test('publisher description progress stays complete beyond the minimum', () => {
  assert.deepEqual(getDescriptionProgress(33), {
    remaining: 0,
    progress: 1,
    state: 'ready',
  });
});

test('publisher wizard has fully removed the legacy fraction-counter copy', () => {
  const wizardSource = fs.readFileSync(
    new URL('../../src/pages/pocket-genes/join-us/new.astro', import.meta.url),
    'utf8',
  );

  assert.doesNotMatch(wizardSource, /descriptionCountLabel|descriptionRemainingLabel/);
  assert.doesNotMatch(wizardSource, />\s*0\s*\/\s*30\s*</);
});
