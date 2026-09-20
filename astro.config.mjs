// @ts-check
import { defineConfig } from 'astro/config';
import { satteri } from '@astrojs/markdown-satteri';
import tailwindcss from '@tailwindcss/vite';

import { siteConfig } from './site.config';
import docLinksPlugin from './src/lib/doc-links-plugin';

/**
 * SITE_URL and BASE_PATH let the same build target a user/org Pages site
 * ("https://pages.example.com"), a project subpath
 * ("https://pages.example.com" + "/signpost"), or a custom domain.
 * The deploy workflow sets them; local builds fall back to the values below.
 */
const site = process.env.SITE_URL || 'http://localhost:4321';
const base = process.env.BASE_PATH || '/';

export default defineConfig({
  site,
  base,
  trailingSlash: 'always',
  build: {
    format: 'directory',
  },
  markdown: {
    /*
     * No syntax highlighting. The default highlighter ships one fixed palette,
     * which reads as a dark rectangle dropped into a light page; the site's own
     * surface and ink tokens already follow the theme.
     */
    syntaxHighlight: false,
    /**
     * The default Markdown processor, with one plugin added.
     *
     * This pipeline exists for the guides in `docs/`, and nothing else reaches
     * it: `content/` is YAML, and the Markdown inside it is rendered by
     * `src/lib/markdown.ts`. The guides are written to be read on GitHub, so
     * their links are repository paths; the plugin rewrites them for a reader
     * of the site, and excludes itself from any document that is not a guide.
     */
    processor: satteri({
      hastPlugins: [
        docLinksPlugin({
          base,
          repository: siteConfig.repository.url,
          branch: siteConfig.repository.branch,
          root: import.meta.dirname,
        }),
      ],
    }),
  },
  vite: {
    plugins: [tailwindcss()],
  },
});
