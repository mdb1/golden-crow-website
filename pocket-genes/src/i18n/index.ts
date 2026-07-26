import { defaultLang, type Lang } from './ui';
import { assertIntegrationDisplayCasing } from './assertIntegrationDisplayCasing';
import { en } from './en';
import { es } from './es';

const translations = { en, es } as const;

assertIntegrationDisplayCasing(en, es);

export function getLangFromUrl(url: URL): Lang {
  const [, lang] = url.pathname.split('/');
  if (lang === 'en') return 'en';
  return defaultLang;
}

export function useTranslations(locale: string | undefined) {
  const lang = (locale === 'en' ? 'en' : defaultLang) as Lang;
  return translations[lang];
}

export function getLocalizedPath(path: string, lang: Lang): string {
  // Remove leading slash for processing
  const cleanPath = path.replace(/^\//, '');
  // Remove any existing locale prefix
  const pathWithoutLocale = cleanPath.replace(/^en\//, '');

  if (lang === defaultLang) {
    return `/${pathWithoutLocale}`;
  }
  return `/${lang}/${pathWithoutLocale}`;
}
