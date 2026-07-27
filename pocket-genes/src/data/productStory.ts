// Forma de una "story page" de producto — la maqueta que estrenó Pocket Genes
// y que ahora también usa GC Fitness (ver `ProductStoryPage.astro`).
//
// Los tipos viven acá y no en `pocketGenesStory.ts` para que agregar un
// producto no dependa del copy de otro.

/** Paleta de la story page. Todo opcional: sin nada, sale la de Pocket Genes. */
export interface StoryPalette {
  accent?: string;
  accentAlt?: string;
  /** Acento claro sobre el hero oscuro (el eyebrow). */
  accentSoft?: string;
  navActiveBg?: string;
  navActiveInk?: string;
  heroOverlay?: string;
  heroOverlayNarrow?: string;
  /** `background-position` del hero, por si la imagen tiene texto propio. */
  heroPosition?: string;
}

export interface StoryNavItem {
  label: string;
  path: string;
  slug?: string;
}

export interface StoryStat {
  value: string;
  label: string;
}

export interface StoryCard {
  title: string;
  body: string;
}

export interface StorySection {
  id?: string;
  eyebrow: string;
  title: string;
  body: string;
  items: StoryCard[];
  image?: string;
  imageAlt?: string;
}

export interface ProductStoryPageData {
  title: string;
  navLabel: string;
  eyebrow: string;
  heroTitle: string;
  heroLead: string;
  heroImage: string;
  heroImageAlt: string;
  primaryActionLabel: string;
  primaryActionHref: string;
  secondaryActionLabel: string;
  secondaryActionHref: string;
  introEyebrow: string;
  introTitle: string;
  introBody: string[];
  stats: StoryStat[];
  pillarsTitle: string;
  pillarsSubtitle: string;
  pillars: StoryCard[];
  sections: StorySection[];
  ethicsTitle: string;
  ethicsBody: string;
  ethicsItems: string[];
  ctaTitle: string;
  ctaBody: string;
  ctaPrimaryLabel: string;
  ctaPrimaryHref: string;
  ctaSecondaryLabel: string;
  ctaSecondaryHref: string;
}
