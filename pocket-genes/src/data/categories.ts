import type { Translations } from '../i18n/en';

export type CategoryId = 'health' | 'fitness';

export interface Category {
  id: CategoryId;
}

export const categories: readonly Category[] = [
  { id: 'health' },
  { id: 'fitness' },
] as const;

export function getCategoryTitle(t: Translations, id: CategoryId): string {
  return t.categories[id].title;
}

export function getCategoryDescription(t: Translations, id: CategoryId): string {
  return t.categories[id].description;
}
