import Slugger from 'github-slugger';
import { Marked } from 'marked';

/**
 * Renders the Markdown that lives inside YAML fields: update bodies, and the
 * long body of a streamline. Astro's own pipeline is reserved for `docs/`,
 * whose guides need a table of contents and the cross-reference plugin.
 *
 * Shared by the page components and the Atom feeds so a reader sees the same
 * thing in their feed reader as on the site.
 *
 * Raw HTML is dropped rather than passed through. Content is reviewed before it
 * merges, so this is not the primary defence, but it costs nothing and means a
 * stray `<script>` in a pull request cannot become stored XSS on a site the
 * whole company reads — or in everyone's feed reader.
 */
const marked = new Marked({
  gfm: true,
  breaks: false,
  renderer: {
    html: () => '',
    /**
     * Headings carry an id, the same slug GitHub would give them.
     *
     * Not decoration: a long body is written with `## What you need to do`
     * sections, and those are what somebody pastes into a chat message when
     * they want a colleague to read one part of it. The slugger is per-render
     * so two bodies on one page each start from a clean slate — within a body,
     * a repeated heading still gets `-1` appended, as it always has.
     */
    heading({ depth, text, tokens }) {
      const inner = this.parser.parseInline(tokens);
      return `<h${depth} id="${slugger.slug(text)}">${inner}</h${depth}>\n`;
    },
  },
});

const slugger = new Slugger();

export function renderMarkdown(content: string): string {
  slugger.reset();
  return marked.parse(content, { async: false });
}

/** The same prose as plain text, for a feed summary or a meta description. */
export function toPlainText(content: string, limit = 400): string {
  const text = renderMarkdown(content)
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(#\d+|[a-z]+);/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (text.length <= limit) return text;
  // Cut at a word boundary so the summary does not end mid-word.
  return `${text.slice(0, text.lastIndexOf(' ', limit) || limit).trimEnd()}…`;
}
