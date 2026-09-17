// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

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
  vite: {
    plugins: [tailwindcss()],
  },
});
