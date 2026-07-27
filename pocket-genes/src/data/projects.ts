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

type ProjectKey = 'project1' | 'project2' | 'project3' | 'project4';

interface ProjectDef {
  key: ProjectKey;
  category: CategoryId;
}

const projectDefs: readonly ProjectDef[] = [
  { key: 'project1', category: 'fitness' },
  { key: 'project2', category: 'health' },
  { key: 'project3', category: 'fitness' },
  { key: 'project4', category: 'fitness' },
] as const;

// Extra link slots a project may fill. The URL lives in the i18n bundle next to
// the rest of the project's fields (so a locale can point at a localized page);
// the LABEL comes from `t.work.links` because it is the same for every project.
const EXTRA_LINKS = [
  { urlKey: 'Download', labelKey: 'download' },
  { urlKey: 'Instagram', labelKey: 'instagram' },
  { urlKey: 'Wiki', labelKey: 'wiki' },
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
