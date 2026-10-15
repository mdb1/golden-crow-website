import { test } from 'node:test';
import assert from 'node:assert/strict';
import { en } from '../../src/i18n/en.ts';
import { es } from '../../src/i18n/es.ts';
import { getProjects } from '../../src/data/projects.ts';
import { categories } from '../../src/data/categories.ts';
import {
  APP_STORE_URL as PG_APP_STORE_URL,
  PLAY_STORE_URL as PG_PLAY_STORE_URL,
  POCKET_GENES_SUPPORT_EMAIL,
  getPublicNavItems,
  trustDocuments,
  trustDocumentsEs,
  getTrustDocument,
} from '../../src/data/pocketGenesPublic.ts';
import {
  APP_STORE_URL as GCF_APP_STORE_URL,
  PLAY_STORE_URL as GCF_PLAY_STORE_URL,
  APP_STORE_APP_URL,
  PLAY_STORE_APP_URL,
  GC_FITNESS_BUNDLE_ID,
  GC_FITNESS_SUPPORT_EMAIL,
} from '../../src/data/gcFitnessPublic.ts';

test('trust center: every English document has a Spanish twin with the same slug, in the same order', () => {
  // [slug].astro builds routes from the ENGLISH list and falls back to the English
  // document when the Spanish one is missing — so a gap would ship English on /es silently.
  assert.deepEqual(
    trustDocumentsEs.map((d) => d.slug),
    trustDocuments.map((d) => d.slug),
  );
  assert.equal(new Set(trustDocuments.map((d) => d.slug)).size, trustDocuments.length, 'duplicate slug');
  for (const doc of trustDocuments) {
    assert.match(doc.slug, /^[a-z0-9]+(-[a-z0-9]+)*$/, `slug ${doc.slug} is not URL-safe`);
    assert.equal(getTrustDocument(doc.slug, 'es')?.slug, doc.slug);
  }
});

test('trust center: every document has a title, summary and at least one headed section', () => {
  for (const doc of [...trustDocuments, ...trustDocumentsEs]) {
    assert.ok(doc.title.trim(), `${doc.slug}: empty title`);
    assert.ok(doc.summary.trim(), `${doc.slug}: empty summary`);
    assert.ok(doc.sections.length > 0, `${doc.slug}: no sections`);
    for (const section of doc.sections) assert.ok(section.heading.trim(), `${doc.slug}: section without heading`);
  }
});

test('Pocket Genes public nav: same destinations in both locales', () => {
  assert.deepEqual(
    getPublicNavItems('es').map((i) => i.href),
    getPublicNavItems('en').map((i) => i.href),
  );
  for (const item of getPublicNavItems('es')) assert.match(item.href, /^\/pocket-genes\//);
});

test('store URLs and app scheme URLs agree on the app identity', () => {
  assert.match(PG_APP_STORE_URL, /^https:\/\/apps\.apple\.com\/([a-z]{2}\/)?app\/[^/]+\/id6748587627$/);
  assert.equal(new URL(PG_PLAY_STORE_URL).searchParams.get('id'), 'goldencrowvs.pocketgenes');

  const appStoreId = GCF_APP_STORE_URL.match(/\/id(\d+)$/)?.[1];
  assert.ok(appStoreId, `no id in ${GCF_APP_STORE_URL}`);
  assert.ok(APP_STORE_APP_URL.endsWith(`/id${appStoreId}`), 'itms-apps:// URL points at a different app');
  assert.equal(new URL(GCF_PLAY_STORE_URL).searchParams.get('id'), GC_FITNESS_BUNDLE_ID);
  assert.equal(PLAY_STORE_APP_URL, `market://details?id=${GC_FITNESS_BUNDLE_ID}`);
});

test('support emails are well-formed', () => {
  for (const email of [POCKET_GENES_SUPPORT_EMAIL, GC_FITNESS_SUPPORT_EMAIL]) {
    assert.match(email, /^[^\s@]+@goldencrowvs\.com$/);
  }
});

test('projects: both locales list the same projects, categories and store links', () => {
  const pick = (t: typeof en) =>
    getProjects(t).map((p) => ({
      category: p.category,
      image: p.image,
      appStoreUrl: p.appStoreUrl,
      googlePlayUrl: p.googlePlayUrl,
      linkCount: p.links?.length ?? 0,
    }));
  assert.deepEqual(pick(es), pick(en));
});

test('projects: every category is known and every project has a title, image and tags', () => {
  const known = new Set(categories.map((c) => c.id));
  for (const t of [en, es]) {
    for (const project of getProjects(t)) {
      assert.ok(known.has(project.category), `unknown category ${project.category}`);
      assert.ok(project.title?.trim(), 'project without title');
      assert.match(project.image, /^\/.+\.(webp|png|jpe?g|svg)$/, `bad image ${project.image}`);
      assert.ok(Array.isArray(project.tags) && project.tags.length > 0, `${project.title}: no tags`);
      for (const link of project.links ?? []) assert.match(link.href, /^(https:\/\/|\/)/, `bad link ${link.href}`);
    }
  }
});
