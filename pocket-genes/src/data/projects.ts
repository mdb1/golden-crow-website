import type { Translations } from '../i18n/en';
import type { CategoryId } from './categories';

export interface Project {
  image: string;
  title: string;
  description: string;
  tags: string[];
  appStoreUrl?: string;
  googlePlayUrl?: string;
  websiteUrl?: string;
  category: CategoryId;
}

type ProjectKey = 'project1' | 'project2' | 'project3';

interface ProjectDef {
  key: ProjectKey;
  category: CategoryId;
}

const projectDefs: readonly ProjectDef[] = [
  { key: 'project1', category: 'fitness' },
  { key: 'project2', category: 'health' },
  { key: 'project3', category: 'fitness' },
] as const;

export function getProjects(t: Translations): Project[] {
  const idx = t.index as Record<string, string | readonly string[]>;
  return projectDefs.map((def) => ({
    image: idx[`${def.key}Image`] as string,
    title: idx[`${def.key}Title`] as string,
    description: idx[`${def.key}Desc`] as string,
    tags: idx[`${def.key}Tags`] as unknown as string[],
    appStoreUrl: (idx[`${def.key}AppStore`] as string) || undefined,
    googlePlayUrl: (idx[`${def.key}GooglePlay`] as string) || undefined,
    websiteUrl: (idx[`${def.key}Website`] as string) || undefined,
    category: def.category,
  }));
}

export function getProjectsByCategory(t: Translations, categoryId: CategoryId): Project[] {
  return getProjects(t).filter((p) => p.category === categoryId);
}
