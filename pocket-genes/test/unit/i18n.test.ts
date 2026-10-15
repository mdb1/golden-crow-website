import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getLangFromUrl, getLocalizedPath, useTranslations } from '../../src/i18n/index.ts';
import { assertIntegrationDisplayCasing } from '../../src/i18n/assertIntegrationDisplayCasing.ts';
import { defaultLang, languages } from '../../src/i18n/ui.ts';
import { en } from '../../src/i18n/en.ts';
import { es } from '../../src/i18n/es.ts';

test('Spanish is the default locale and both locales are declared', () => {
  assert.equal(defaultLang, 'es');
  assert.deepEqual(Object.keys(languages).sort(), ['en', 'es']);
});

test('getLangFromUrl reads the /en prefix and defaults to Spanish', () => {
  assert.equal(getLangFromUrl(new URL('https://goldencrowvs.com/en/')), 'en');
  assert.equal(getLangFromUrl(new URL('https://goldencrowvs.com/en/work/')), 'en');
  assert.equal(getLangFromUrl(new URL('https://goldencrowvs.com/')), 'es');
  assert.equal(getLangFromUrl(new URL('https://goldencrowvs.com/work/')), 'es');
  // A route that merely starts with "en" is not English.
  assert.equal(getLangFromUrl(new URL('https://goldencrowvs.com/engineering/')), 'es');
});

test('getLocalizedPath prefixes English and strips the prefix for Spanish', () => {
  assert.equal(getLocalizedPath('/work', 'en'), '/en/work');
  assert.equal(getLocalizedPath('/work', 'es'), '/work');
  assert.equal(getLocalizedPath('/', 'en'), '/en/');
  assert.equal(getLocalizedPath('/', 'es'), '/');
  assert.equal(getLocalizedPath('/en/work', 'es'), '/work');
  assert.equal(getLocalizedPath('/en/work', 'en'), '/en/work', 'must not double-prefix');
  assert.equal(getLocalizedPath('work', 'en'), '/en/work');
});

test('useTranslations picks English only for "en" and falls back to Spanish', () => {
  assert.equal(useTranslations('en'), en);
  assert.equal(useTranslations('es'), es);
  assert.equal(useTranslations(undefined), es);
  assert.equal(useTranslations('fr'), es);
});

/** Every leaf path with its type ("string" / "array:N" / …), so shape drift shows up as a diff. */
function shape(tree: unknown, prefix = ''): Map<string, string> {
  const out = new Map<string, string>();
  if (Array.isArray(tree)) {
    out.set(prefix, `array:${tree.length}`);
    tree.forEach((item, i) => {
      if (item && typeof item === 'object') for (const [k, v] of shape(item, `${prefix}[${i}]`)) out.set(k, v);
    });
  } else if (tree && typeof tree === 'object') {
    for (const [key, value] of Object.entries(tree)) {
      for (const [k, v] of shape(value, prefix ? `${prefix}.${key}` : key)) out.set(k, v);
    }
  } else {
    out.set(prefix, typeof tree);
  }
  return out;
}

test('es and en translation trees have identical keys, types and array lengths', () => {
  const enShape = shape(en);
  const esShape = shape(es);
  const onlyEn = [...enShape.keys()].filter((k) => !esShape.has(k));
  const onlyEs = [...esShape.keys()].filter((k) => !enShape.has(k));
  const mismatched = [...enShape].filter(([k, v]) => esShape.has(k) && esShape.get(k) !== v).map(
    ([k, v]) => `${k}: en=${v} es=${esShape.get(k)}`,
  );
  assert.deepEqual({ onlyEn, onlyEs, mismatched }, { onlyEn: [], onlyEs: [], mismatched: [] });
});

/** Strings that are empty by design. */
const ALLOWED_EMPTY = [
  // Optional project URL slots: empty means "no link" (see getProjects).
  /^index\.project\d+(AppStore|GooglePlay|Website|Page|Site|Download|Instagram|Wiki|Press)$/,
  // Hero renders description + highlight; the Spanish description is already a full sentence.
  /^hero\.highlight$/,
];

test('no translation string is empty or a leaked placeholder', () => {
  const bad: string[] = [];
  const walk = (tree: unknown, path: string, lang: string) => {
    if (typeof tree === 'string') {
      if (!tree.trim() && !ALLOWED_EMPTY.some((pattern) => pattern.test(path))) bad.push(`${lang}:${path} is empty`);
      // Case-sensitive on purpose: Spanish "todo" means "everything".
      if (/\b(undefined|NaN|TODO|TBD|FIXME)\b|lorem ipsum/.test(tree)) bad.push(`${lang}:${path} = "${tree}"`);
    } else if (tree && typeof tree === 'object') {
      for (const [key, value] of Object.entries(tree)) walk(value, path ? `${path}.${key}` : key, lang);
    }
  };
  walk(en, '', 'en');
  walk(es, '', 'es');
  assert.deepEqual(bad, []);
});

test('assertIntegrationDisplayCasing accepts the shipped copy', () => {
  assert.doesNotThrow(() => assertIntegrationDisplayCasing(en, es));
});

test('assertIntegrationDisplayCasing rejects an English heading that lost its uppercase', () => {
  const brokenEn = structuredClone(en) as typeof en;
  (brokenEn as any).plan.title = 'Lowercase title';
  const esUpper = structuredClone(es) as typeof es;
  (esUpper as any).plan.title = 'TÍTULO';
  assert.throws(() => assertIntegrationDisplayCasing(brokenEn, esUpper), /plan\.title/);
});
