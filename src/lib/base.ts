/**
 * Base-path joining, with no dependency on the build environment.
 *
 * `url()` applies the site's ambient base; the docs link resolver is handed a
 * base as an argument so its rules can be tested for a root install and a
 * subpath install alike, and so it can run inside the Astro config, where
 * `import.meta.env` does not exist. Both go through this one implementation.
 */

/**
 * Join a site path onto a base.
 *
 * `withBase('/roadmap', '/')` -> `/roadmap/`;
 * `withBase('/roadmap', '/signpost/')` -> `/signpost/roadmap/`.
 * Paths that look like files (`/feed.xml`) keep their exact shape.
 */
export function withBase(path: string, base: string): string {
  /** Base without a trailing slash: '' for root installs, '/signpost' for subpaths. */
  const prefix = base.endsWith('/') ? base.slice(0, -1) : base;
  const withLeadingSlash = path.startsWith('/') ? path : `/${path}`;

  const looksLikeFile = /\.[a-z0-9]+$/i.test(withLeadingSlash);
  const normalized =
    looksLikeFile || withLeadingSlash.endsWith('/')
      ? withLeadingSlash
      : `${withLeadingSlash}/`;

  return `${prefix}${normalized}` || '/';
}
