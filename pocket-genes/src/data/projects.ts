import type { Translations } from '../i18n/en';
import type { CategoryId } from './categories';

/** An extra link rendered as a pill under a project card's store badges. */
export interface ProjectLink {
  label: string;
  href: string;
}

export interface Project {
  image: string;
  title: string;
  description: string;
  tags: string[];
  appStoreUrl?: string;
  googlePlayUrl?: string;
  websiteUrl?: string;
  /**
   * Extra destinations (download page, Instagram, coach wiki, …). Optional so
   * the hand-rolled project arrays in apps.astro keep type-checking.
   */
  links?: ProjectLink[];
  category: CategoryId;
}

type ProjectKey =
  | 'project1'
  | 'project2'
  | 'project3'
  | 'project4'
  | 'project5'
  | 'project6'
  | 'project7';

interface ProjectDef {
  key: ProjectKey;
  category: CategoryId;
}

// Order matters twice over: it is the order of the homepage "Success Stories"
// carousel AND the order inside each category on /work. GC Fitness leads —
// it is our own product, and the carousel only shows three cards at a time, so
// anything in fourth place is invisible until the user drags.
const projectDefs: readonly ProjectDef[] = [
  { key: 'project4', category: 'fitness' },   // GC Fitness
  { key: 'project1', category: 'fitness' },   // StrongerU
  { key: 'project2', category: 'health' },    // PocketGenes
  { key: 'project3', category: 'fitness' },   // Anytime Fitness
  { key: 'project7', category: 'fitness' },   // BAX-U Golf
  { key: 'project5', category: 'mobility' },  // James
  { key: 'project6', category: 'culture' },   // Jardín Sonoro
] as const;

// Extra link slots a project may fill. The URL lives in the i18n bundle next to
// the rest of the project's fields (so a locale can point at a localized page);
// the LABEL comes from `t.work.links` because it is the same for every project.
// `Site` is deliberately NOT the legacy `websiteUrl` field: that one turns the
// whole card into an anchor, which cannot coexist with pills (see the assertion
// at the bottom of getProjects). A project with more than one destination puts
// its own site here instead.
const EXTRA_LINKS = [
  { urlKey: 'Site', labelKey: 'site' },
  { urlKey: 'Download', labelKey: 'download' },
  { urlKey: 'Instagram', labelKey: 'instagram' },
  { urlKey: 'Wiki', labelKey: 'wiki' },
  { urlKey: 'Press', labelKey: 'press' },
] as const;

export function getProjects(t: Translations): Project[] {
  const idx = t.index as Record<string, string | readonly string[]>;
  const projects = projectDefs.map((def) => ({
    image: idx[`${def.key}Image`] as string,
    title: idx[`${def.key}Title`] as string,
    description: idx[`${def.key}Desc`] as string,
    tags: idx[`${def.key}Tags`] as unknown as string[],
    appStoreUrl: (idx[`${def.key}AppStore`] as string) || undefined,
    googlePlayUrl: (idx[`${def.key}GooglePlay`] as string) || undefined,
    websiteUrl: (idx[`${def.key}Website`] as string) || undefined,
    links: EXTRA_LINKS.flatMap(({ urlKey, labelKey }) => {
      const href = idx[`${def.key}${urlKey}`] as string | undefined;
      return href ? [{ label: t.work.links[labelKey], href }] : [];
    }),
    category: def.category,
  }));

  // ProjectCard makes the WHOLE card an <a href={websiteUrl}> when a website URL
  // is present. Store badges and pills are anchors too, so mixing the two styles
  // would nest anchors — invalid HTML that browsers unnest, breaking both links.
  // Fail the build instead of shipping a card whose links silently don't work.
  for (const p of projects) {
    const hasInnerLinks = Boolean(p.appStoreUrl || p.googlePlayUrl) || (p.links?.length ?? 0) > 0;
    if (p.websiteUrl && hasInnerLinks) {
      throw new Error(
        `Project "${p.title}" sets websiteUrl AND inner links (store badges / pills). ` +
          `Pick one: a whole-card link, or a card with its own links. ` +
          `To keep the site link, move it into the project's Download/Instagram/Wiki slots.`
      );
    }
  }

  return projects;
}

export function getProjectsByCategory(t: Translations, categoryId: CategoryId): Project[] {
  return getProjects(t).filter((p) => p.category === categoryId);
}
