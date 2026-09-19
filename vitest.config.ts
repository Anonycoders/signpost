import { fileURLToPath } from 'node:url';
import { getViteConfig } from 'astro/config';

/**
 * The derived-data functions in src/lib/ are deliberately free of Astro, so
 * they run here directly. They do read taxonomies from site.config.ts, which
 * needs the same aliases the app and tsconfig use.
 *
 * The config comes from Astro rather than from vitest directly so that the few
 * tests that render a component — the ones that check what a reader actually
 * sees — can compile `.astro` files through the same pipeline the build uses.
 * Everything else is unaffected by that.
 */
export default getViteConfig({
  resolve: {
    alias: {
      '@config': fileURLToPath(new URL('./site.config.ts', import.meta.url)),
      '@/': fileURLToPath(new URL('./src/', import.meta.url)),
    },
  },
});
