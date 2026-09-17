import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * The derived-data functions in src/lib/ are deliberately free of Astro, so
 * they run here directly. They do read taxonomies from site.config.ts, which
 * needs the same aliases the app and tsconfig use.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@config': fileURLToPath(new URL('./site.config.ts', import.meta.url)),
      '@/': fileURLToPath(new URL('./src/', import.meta.url)),
    },
  },
});
