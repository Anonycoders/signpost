/**
 * Link resolution for the guides in `docs/`.
 *
 * Those files are written to be read on GitHub first: their links are ordinary
 * relative repository paths. When the same file is rendered as a page of this
 * site, every one of those links has to be re-pointed, because the reader is no
 * longer standing in the repository.
 *
 * There are four rules, in order:
 *
 *   1. A link that is not a relative path — an absolute URL, `mailto:`, or a
 *      bare `#anchor` — is left exactly as written.
 *   2. A link to another file in `docs/` becomes that file's page on this site,
 *      keeping its anchor.
 *   3. A link to a page source that names exactly one route — `src/pages/.../
 *      index.astro` — becomes that route. Someone clicking "/roadmap/" in the
 *      reading guide wants the roadmap, not the file that builds it.
 *   4. Everything else is a file in the repository and becomes a GitHub blob
 *      URL, built from the configured repository rather than a fixed org.
 *
 * Nothing here touches Astro or the content collections, so the rules can be
 * tested on their own — they are as much a part of the product as the pages.
 */

import { withBase } from './base';

/** The directory the docs collection is loaded from, relative to the repo root. */
export const DOCS_DIR = 'docs';

/**
 * The heading a guide puts its own contents list under.
 *
 * A reader on GitHub has no other way to see the shape of a long file, so two
 * of the guides write the list into their text. The page shows the same list
 * beside the document instead, where it stays while you read, so this section
 * is hidden here (`global.css`) and left out of that list — a contents entry
 * for the contents is noise. The value is the id, which is the slug of the
 * heading's text, here and on GitHub.
 */
export const INLINE_TOC_ID = 'contents';

/** Where a rendered doc lives on the site. */
export function docRoute(slug: string): string {
  return `/${DOCS_DIR}/${slug}`;
}

/**
 * The slug a doc file is published under, or `null` if that file is not one of
 * the rendered docs.
 *
 * This is the same shape as the collection's glob (`docs/*.md`): Markdown
 * directly inside `docs/`, nothing nested, nothing elsewhere. `CONTRIBUTING.md`
 * sits at the repository root and so is never a page — deliberately, since its
 * reader is on their way to opening a pull request anyway.
 */
export function docSlugForPath(repoPath: string): string | null {
  const match = new RegExp(`^${DOCS_DIR}/([^/]+)\\.md$`).exec(repoPath);
  return match ? match[1] : null;
}

/**
 * The route a page source builds, or `null` if it does not name exactly one.
 *
 * Only `index.astro` qualifies. A dynamic route (`[slug].astro`) or an endpoint
 * (`feed.xml.ts`) stands for many URLs or for no page at all, so a link to one
 * is a link to the source file and resolves as such. The maintainer's guide
 * relies on that distinction: it cites `src/pages/teams/[slug].astro` as code.
 */
export function viewRouteForPageSource(repoPath: string): string | null {
  const match = /^src\/pages\/(.*)index\.astro$/.exec(repoPath);
  if (!match) return null;
  return `/${match[1]}`;
}

/** Split an href into its path and the `#anchor` / `?query` that trail it. */
function splitSuffix(href: string): { path: string; suffix: string } {
  const at = href.search(/[#?]/);
  return at === -1
    ? { path: href, suffix: '' }
    : { path: href.slice(0, at), suffix: href.slice(at) };
}

/**
 * Resolve `relative` against the directory holding `fromPath`, both
 * repo-relative. Returns `null` if it escapes the repository root, which we
 * cannot map to anything and therefore leave alone.
 */
function resolveRepoPath(fromPath: string, relative: string): string | null {
  const segments = fromPath.split('/').slice(0, -1);

  for (const segment of relative.split('/')) {
    if (segment === '' || segment === '.') continue;
    if (segment === '..') {
      if (segments.length === 0) return null;
      segments.pop();
      continue;
    }
    segments.push(segment);
  }

  return segments.length > 0 ? segments.join('/') : null;
}

export interface DocLinkContext {
  /** Repo-relative path of the doc being rendered, e.g. `docs/using.md`. */
  from: string;
  /** The site's base path, as `import.meta.env.BASE_URL` gives it. */
  base: string;
  /** Repository web URL, with or without a trailing slash. */
  repository: string;
  /** Branch the blob links should point at. */
  branch: string;
}

/**
 * Rewrite one link from a doc so it lands where a reader of the site expects.
 *
 * Pure: the same inputs always give the same href, which is what lets the rules
 * above be pinned down in tests.
 */
export function resolveDocHref(href: string, context: DocLinkContext): string {
  // Rule 1 — anything that is not a relative repository path stays as written.
  // That covers absolute URLs, protocol-relative ones, `mailto:`, and the
  // in-page anchors the guides' tables of contents are built from.
  if (href === '' || href.startsWith('#') || href.startsWith('/')) return href;
  if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith('//')) return href;

  const { path, suffix } = splitSuffix(href);
  const target = resolveRepoPath(context.from, path);
  if (target === null) return href;

  // Rule 2 — another guide.
  const slug = docSlugForPath(target);
  if (slug !== null) return withBase(docRoute(slug), context.base) + suffix;

  // Rule 3 — a page source that names one view.
  const route = viewRouteForPageSource(target);
  if (route !== null) return withBase(route, context.base) + suffix;

  // Rule 4 — a file in the repository.
  const repository = context.repository.replace(/\/$/, '');
  return `${repository}/blob/${context.branch}/${target}${suffix}`;
}

/**
 * The first `# ` heading of a doc, which is its title.
 *
 * The docs carry no frontmatter on purpose — GitHub renders it as a table at
 * the top of the file — so the title is read from the body, and the body's own
 * `<h1>` is what the page shows. There is only ever one.
 */
export function docTitle(body: string, fallback: string): string {
  const match = /^#\s+(.+?)\s*$/m.exec(body);
  return match ? match[1] : fallback;
}

/**
 * How long a guide takes to read, in minutes.
 *
 * Shown in the title band so someone can tell a two-minute answer from a
 * twenty-minute one before they start. 200 words a minute is the unhurried end
 * of the usual range, which is the right end for a reference document.
 */
export function readingMinutes(body: string): number {
  const words = body.trim().split(/\s+/).filter((word) => word !== '').length;
  return Math.max(1, Math.round(words / 200));
}

/**
 * The doc's opening sentence, for the page description and the docs index.
 *
 * The first paragraph after the title, with Markdown emphasis and links reduced
 * to their text, cut at a sentence boundary when it runs long.
 */
export function docSummary(body: string): string {
  const afterTitle = body.replace(/^#\s+.+$/m, '');

  const paragraph = afterTitle
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .find((block) => block !== '' && !block.startsWith('#') && !block.startsWith('```'));

  if (paragraph === undefined) return '';

  const plain = paragraph
    .replace(/\s*\n\s*/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[*_`]/g, '')
    .trim();

  if (plain.length <= 180) return plain;

  // The last sentence boundary that fits. A summary that stops early reads
  // like a summary; one cut mid-word reads like a bug. A full stop only counts
  // when a space or the end follows it, so `docs/adopting.md` is not one.
  let end = 0;
  for (const match of plain.matchAll(/[.!?](?=\s|$)/g)) {
    if (match.index + 1 > 180) break;
    end = match.index + 1;
  }
  if (end > 0) return plain.slice(0, end);

  const cut = plain.slice(0, 180);
  return `${cut.slice(0, cut.lastIndexOf(' ')).trimEnd()}…`;
}
