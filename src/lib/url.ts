/**
 * Base-aware URL helper.
 *
 * The site may be served from a subpath (e.g. `/signpost/` on a project Pages
 * site), so every internal link must go through this rather than hard-coding
 * a leading slash.
 */

const RAW_BASE = import.meta.env.BASE_URL ?? '/';

/** Base without a trailing slash: '' for root installs, '/signpost' for subpaths. */
const BASE = RAW_BASE.endsWith('/') ? RAW_BASE.slice(0, -1) : RAW_BASE;

/**
 * Build an internal URL.
 *
 * `url('/roadmap')` -> `/roadmap/` (or `/signpost/roadmap/` on a subpath install).
 * Paths that look like files (`/feed.xml`) keep their exact shape.
 */
export function url(path = '/'): string {
  const withLeadingSlash = path.startsWith('/') ? path : `/${path}`;

  const looksLikeFile = /\.[a-z0-9]+$/i.test(withLeadingSlash);
  const normalized =
    looksLikeFile || withLeadingSlash.endsWith('/')
      ? withLeadingSlash
      : `${withLeadingSlash}/`;

  return `${BASE}${normalized}` || '/';
}

/** True when `href` is the page currently being rendered. */
export function isActive(href: string, currentPathname: string): boolean {
  const target = url(href);
  if (target === url('/')) return currentPathname === target;
  return currentPathname.startsWith(target);
}
