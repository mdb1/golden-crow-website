import type { Translations } from '../i18n/en';

export type CategoryId = 'health' | 'fitness' | 'mobility' | 'culture';

export interface Category {
  id: CategoryId;
}

// Section order on /work. New categories are appended so the existing two keep
// the position they have always had.
export const categories: readonly Category[] = [
  { id: 'health' },
  { id: 'fitness' },
  { id: 'mobility' },
  { id: 'culture' },
] as const;

export function getCategoryTitle(t: Translations, id: CategoryId): string {
  return t.categories[id].title;
}

export function getCategoryDescription(t: Translations, id: CategoryId): string {
  return t.categories[id].description;
}
