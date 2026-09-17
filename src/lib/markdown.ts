import { Marked } from 'marked';

/**
 * Renders the short Markdown that lives inside YAML fields — update bodies,
 * mainly. The long-form body of a streamline file goes through Astro's own
 * pipeline instead.
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
  },
});

export function renderMarkdown(content: string): string {
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
