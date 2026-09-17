/**
 * Stable fragment identifiers for individual updates.
 *
 * A feed entry has to point at the thing it announced, not just at the page it
 * lives on, and its `id` must never change once a reader has seen it —
 * otherwise every rebuild marks old entries unread. Both come from the same
 * function so the anchor in the HTML and the one in the feed cannot drift.
 *
 * Built from the date and the title because those are what a content file
 * actually has: there is no author-supplied id to use, and position in the
 * file would shift the moment someone inserts an update above.
 */

const MAX_SLUG_LENGTH = 48;

/** Lowercase, dash-separated, ASCII-only — safe in a URL fragment. */
export function slugify(value: string): string {
  const slug = value
    .normalize('NFKD')
    // Drop combining marks, so "Über" becomes "uber" rather than "ber".
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  if (slug.length <= MAX_SLUG_LENGTH) return slug;

  // Cut at a word boundary: a fragment ending mid-word reads like a truncation
  // bug to anyone who sees it in the address bar.
  const trimmed = slug.slice(0, MAX_SLUG_LENGTH);
  const lastDash = trimmed.lastIndexOf('-');
  return (lastDash > 0 ? trimmed.slice(0, lastDash) : trimmed).replace(/-+$/, '');
}

/**
 * The fragment for one update: `update-2026-09-10-ingress-v1beta1-is-removed`.
 *
 * Dated by when it was posted rather than when it takes effect, because the
 * posting date is the one that never changes afterwards.
 */
export function updateAnchor(update: { date: Date; title: string }): string {
  const day = update.date.toISOString().slice(0, 10);
  const slug = slugify(update.title);
  return slug ? `update-${day}-${slug}` : `update-${day}`;
}
