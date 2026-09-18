/**
 * The one place the docs link rules are attached to the Markdown pipeline.
 *
 * That pipeline is shared: it renders the long-form body of every streamline as
 * well as the guides. So this is written as a plugin *factory*. Sätteri calls
 * the factory once per document with the file being compiled, and a factory
 * that returns `false` is left out of that document's pipeline entirely. A
 * streamline is therefore not merely skipped over — the plugin never runs on it.
 *
 * The rules themselves live in `doc-links.ts` and know nothing about Markdown.
 *
 * This module is imported by `astro.config.mjs`, which is loaded outside Vite,
 * so nothing on this path may read `import.meta.env`.
 */

import { fileURLToPath } from 'node:url';
import path from 'node:path';

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
  children?: unknown[];
}

interface HastContext {
  setProperty(node: HastElement, key: string, value: unknown): void;
  wrapNode(node: HastElement, parent: HastElement): void;
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

    return {
      name: 'doc-links',
      element: [
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
