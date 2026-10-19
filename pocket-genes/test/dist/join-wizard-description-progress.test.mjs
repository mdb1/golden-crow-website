import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadPage } from '../support/dist.mjs';

const localizedPages = [
  {
    page: 'pocket-genes/join-us/new/index.html',
    initial: 'Faltan 30 caracteres para llegar al mínimo',
    ready: '¡Ya podés avanzar!',
  },
  {
    page: 'en/pocket-genes/join-us/new/index.html',
    initial: '30 characters left to reach the minimum',
    ready: 'You’re ready to continue!',
  },
];

test('join wizard explains the minimum in its localized progress pill', () => {
  for (const { page, initial, ready } of localizedPages) {
    const { html, root } = loadPage(page);
    const progress = root.querySelector('[data-description-count]');
    const announcer = root.querySelector('[data-description-announcer]');
    const textarea = root.querySelector('[data-description-primary]');

    assert.ok(progress, `${page}: missing description progress pill`);
    assert.ok(announcer, `${page}: missing threshold-change announcer`);
    assert.equal(progress.getAttribute('data-progress-state'), 'needs-more');
    assert.equal(announcer.getAttribute('aria-live'), 'polite');
    assert.equal(announcer.getAttribute('aria-atomic'), 'true');
    assert.equal(progress.text.trim(), initial);
    assert.doesNotMatch(progress.text, /\d+\s*\/\s*30/);
    assert.match(textarea.getAttribute('aria-describedby') ?? '', /publisher-description-progress/);
    assert.match(html, new RegExp(ready.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});
