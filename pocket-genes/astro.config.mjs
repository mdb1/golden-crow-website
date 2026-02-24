// astro.config.mjs
import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://goldencrowvs.com',
  base: '/',
  output: 'static',
  i18n: {
    defaultLocale: 'es',
    locales: ['es', 'en'],
    routing: {
      prefixDefaultLocale: false,
    },
  },
});
