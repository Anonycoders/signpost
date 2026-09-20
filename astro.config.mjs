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
     * surface and ink tokens already follow the theme. Nothing in `content/`
     * uses a fenced block, so this only ever applies to the guides.
     */
    syntaxHighlight: false,
    /**
     * The default Markdown processor, with one plugin added.
     *
     * The guides in `docs/` are written to be read on GitHub, so their links
     * are repository paths; this rewrites them for a reader of the site. The
     * plugin is a factory: it is handed the file being compiled and excludes
     * itself from every document that is not a guide, which is what keeps a
     * stray `.md` anywhere else from having its links rewritten.
     *
     * Content does not come through here at all. `content/` is YAML, and the
     * Markdown inside it is rendered by `src/lib/markdown.ts`.
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
