/**
 * Base-aware URL helper.
 *
 * The site may be served from a subpath (e.g. `/signpost/` on a project Pages
 * site), so every internal link must go through this rather than hard-coding
 * a leading slash.
 */

import { withBase } from './base';

const RAW_BASE = import.meta.env.BASE_URL ?? '/';

/**
 * Build an internal URL.
 *
 * `url('/roadmap')` -> `/roadmap/` (or `/signpost/roadmap/` on a subpath install).
 * Paths that look like files (`/feed.xml`) keep their exact shape.
 */
export function url(path = '/'): string {
  return withBase(path, RAW_BASE);
}

/** True when `href` is the page currently being rendered. */
export function isActive(href: string, currentPathname: string): boolean {
  const target = url(href);
  if (target === url('/')) return currentPathname === target;
  return currentPathname.startsWith(target);
}
