/**
 * The one place the docs link rules are attached to the Markdown pipeline.
 *
 * Written as a plugin *factory*: Sätteri calls it once per document with the
 * file being compiled, and a factory that returns `false` is left out of that
 * document's pipeline entirely, rather than running and skipping over it.
 *
 * Today that guard has little to do — `docs/*.md` is the only Markdown Astro
 * compiles, since content is YAML and the repository's own README and
 * CONTRIBUTING are not pages. It stays because the cost is one comparison and
 * the failure it prevents is silent: a `.md` page added under `src/pages/`
 * would otherwise have its links rewritten as though it were a guide.
 *
 * The rules themselves live in `doc-links.ts` and know nothing about Markdown.
 *
 * This module is imported by `astro.config.mjs`, which is loaded outside Vite,
 * so nothing on this path may read `import.meta.env`.
 */

import { fileURLToPath } from 'node:url';
import path from 'node:path';

import Slugger from 'github-slugger';

import { docSlugForPath, resolveDocHref, type DocLinkContext } from './doc-links';

/**
 * The slices of Sätteri's plugin API this uses.
 *
 * Declared here rather than imported: `satteri` is a transitive package, and
 * the shape needed is small enough that pinning it locally is clearer than
 * reaching through `@astrojs/markdown-satteri` for it.
 */
interface HastElement {
  type: string;
  tagName: string;
  properties?: Record<string, unknown>;
  children?: HastChild[];
}

interface HastText {
  type: 'text';
  value: string;
}

type HastChild = HastElement | HastText;

interface HastContext {
  setProperty(node: HastElement, key: string, value: unknown): void;
  wrapNode(node: HastElement, parent: HastElement): void;
  appendChild(node: HastElement, child: HastChild): void;
  removeNode(node: HastElement): void;
  textContent(node: HastElement): string;
}

interface FactoryContext {
  readonly fileURL: URL | undefined;
}

export interface DocLinksPluginOptions {
  base: string;
  repository: string;
  branch: string;
  /** Repository root, for making the compiled file's path relative to it. */
  root: string;
}

export default function docLinksPlugin(options: DocLinksPluginOptions) {
  return (factory: FactoryContext) => {
    if (factory.fileURL === undefined) return false;

    const relative = path.relative(options.root, fileURLToPath(factory.fileURL));
    if (relative === '' || relative.startsWith('..') || path.isAbsolute(relative)) return false;

    const from = relative.split(path.sep).join('/');
    if (docSlugForPath(from) === null) return false;

    const context: DocLinkContext = {
      from,
      base: options.base,
      repository: options.repository,
      branch: options.branch,
    };

    /*
     * Each of these guides opens with its own `# ` title, which the page turns
     * into the title band every other section page on this site has. The band
     * is then the page's one `<h1>`, so the copy in the body comes out. This
     * flag makes that the *first* one only: a second `# ` further down would be
     * a section heading, and removing it would lose text.
     */
    let titleLifted = false;

    /*
     * The same slugger Astro uses, for the same reason: these ids are what the
     * guides' own `#anchor` links point at, here and on GitHub.
     *
     * Astro assigns heading ids in a later pass, after this one, so a permalink
     * written here cannot read the id it should point at — it has to be the one
     * deciding it. Astro's pass keeps an id that is already set and reports it
     * in the headings it hands the page, so the contents rail, the heading and
     * the permalink all end up agreeing by construction. One slugger for the
     * whole document, so two headings with the same words still get different
     * ids.
     */
    const slugger = new Slugger();

    return {
      name: 'doc-links',
      element: [
        {
          filter: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'],
          visit(node: HastElement, ctx: HastContext) {
            /*
             * The guide's own `# ` title becomes the page's title band, so the
             * copy in the body comes out and the page has exactly one `<h1>`.
             * The first one only: a second would be a section heading, and
             * removing it would lose text.
             */
            if (node.tagName === 'h1' && !titleLifted) {
              titleLifted = true;
              ctx.removeNode(node);
              return;
            }

            const text = ctx.textContent(node);
            const id = slugger.slug(text);
            ctx.setProperty(node, 'id', id);

            /*
             * A permalink on each section heading. Half of what anyone does
             * with a reference document is send someone else a link to one part
             * of it; without this they have to go and find the anchor
             * themselves. Only the two levels the contents list shows, so the
             * page does not sprout a control on every line.
             *
             * The `#` is drawn by CSS rather than put in the markup: this text
             * would otherwise end up inside the heading, and so inside the
             * heading text Astro reports to the page for the contents rail.
             */
            if (node.tagName !== 'h2' && node.tagName !== 'h3') return;

            ctx.appendChild(node, {
              type: 'element',
              tagName: 'a',
              properties: {
                href: `#${id}`,
                className: ['heading-anchor'],
                'aria-label': `Link to “${text}”`,
              },
              children: [],
            });
          },
        },
        {
          filter: ['a'],
          visit(node: HastElement, ctx: HastContext) {
            const href = node.properties?.href;
            if (typeof href !== 'string') return;
            ctx.setProperty(node, 'href', resolveDocHref(href, context));
          },
        },
        {
          /*
           * A table in a guide is up to three columns of prose, which a phone
           * cannot show without squeezing every column down to one word.
           * Wrapping it lets the table keep a width it can be read at and
           * scroll inside its own box, rather than dragging the page sideways.
           */
          filter: ['table'],
          visit(node: HastElement, ctx: HastContext) {
            ctx.wrapNode(node, {
              type: 'element',
              tagName: 'div',
              properties: { className: ['table-scroll'] },
              children: [],
            });
          },
        },
      ],
    };
  };
}
