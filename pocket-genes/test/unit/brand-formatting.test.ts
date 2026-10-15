import { test } from 'node:test';
import assert from 'node:assert/strict';
import { escapeHtml, formatBrandHtml, formatBrandText } from '../../src/utils/brandFormatting.ts';

test('escapeHtml escapes the five HTML-significant characters', () => {
  assert.equal(escapeHtml(`<a href="x" title='y'>&</a>`), '&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;&amp;&lt;/a&gt;');
});

test('escapeHtml turns null/undefined into an empty string (never the word "undefined")', () => {
  assert.equal(escapeHtml(undefined), '');
  assert.equal(escapeHtml(null), '');
  assert.equal(escapeHtml(0), '0');
});

test('escapeHtml does not double-escape when run once', () => {
  assert.equal(escapeHtml('a &amp; b'), 'a &amp;amp; b');
});

test('formatBrandHtml italicises RareFriends, keeping an existing ™', () => {
  assert.equal(formatBrandHtml('Join RareFriends'), 'Join <em class="pg-brand-name">RareFriends</em>');
  assert.equal(formatBrandHtml('RareFriends™ hub'), '<em class="pg-brand-name">RareFriends™</em> hub');
});

test('formatBrandHtml always renders PockeAmigos with the ™', () => {
  assert.equal(formatBrandHtml('Sumate a PockeAmigos'), 'Sumate a <em class="pg-brand-name">PockeAmigos™</em>');
  assert.equal(formatBrandHtml('PockeAmigos™'), '<em class="pg-brand-name">PockeAmigos™</em>');
});

test('formatBrandHtml italicises the full studio name, every occurrence', () => {
  assert.equal(
    formatBrandHtml('Golden Crow Venture Studio & Golden Crow Venture Studio'),
    '<em class="pg-brand-name">Golden Crow Venture Studio</em> & <em class="pg-brand-name">Golden Crow Venture Studio</em>',
  );
});

test('formatBrandText escapes user/content HTML before adding brand markup', () => {
  assert.equal(
    formatBrandText('<script>RareFriends</script>'),
    '&lt;script&gt;<em class="pg-brand-name">RareFriends</em>&lt;/script&gt;',
  );
  assert.equal(formatBrandText(undefined), '');
});
