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

/**
 * The named entities the renderer emits, plus the one authors type by hand.
 *
 * Anything else is left as it was written. A `&copy;` nobody decoded is odd to
 * read; a `&copy;` nobody decoded and then deleted is a word missing from a
 * sentence, and only one of those is something a writer can see and fix.
 */
const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

/** Whether a numeric reference stands for something a sentence can hold. */
function isPrintable(code: number): boolean {
  if (!Number.isInteger(code) || code > 0x10ffff) return false;
  // A lone surrogate is half a character and renders as a replacement box.
  if (code >= 0xd800 && code <= 0xdfff) return false;
  if (code === 0x7f) return false;
  // The three that survive are whitespace, and collapse to a space below.
  return code >= 0x20 || code === 0x09 || code === 0x0a || code === 0x0d;
}

/**
 * Entities back into the characters they stand for.
 *
 * `renderMarkdown` escapes as it renders, because its output is HTML. Plain
 * text is not, so an `&amp;` here is not an ampersand being kept safe — it is
 * an ampersand written in a language nothing downstream speaks. This used to
 * delete them, which is why a body reading `R&D` arrived as `R D` and
 * `--context <your-cluster>` arrived as `--context`, with the placeholder the
 * sentence was about gone and no sign that anything had been.
 *
 * One pass, so `&amp;lt;` decodes to `&lt;` and stops there. Decoding twice
 * would let an author write a character they never wrote.
 *
 * Both callers escape what they get — the feed for XML, the announcer for
 * Slack's mrkdwn — so a decoded `<` is text at every end. Order matters for
 * that: tags are stripped before this runs, never after, or a decoded `<`
 * would look like markup and take the rest of the sentence with it.
 */
function decodeEntities(text: string): string {
  return text.replace(/&(#\d{1,7}|#[Xx][0-9A-Fa-f]{1,6}|[A-Za-z]+);/g, (whole, body: string) => {
    if (!body.startsWith('#')) return NAMED_ENTITIES[body.toLowerCase()] ?? whole;

    const hex = body[1] === 'x' || body[1] === 'X';
    const code = Number.parseInt(body.slice(hex ? 2 : 1), hex ? 16 : 10);

    return isPrintable(code) ? String.fromCodePoint(code) : whole;
  });
}

/** The same prose as plain text, for a feed summary or a chat message. */
export function toPlainText(content: string, limit = 400): string {
  const text = decodeEntities(renderMarkdown(content).replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();

  if (text.length <= limit) return text;
  // Cut at a word boundary so the summary does not end mid-word.
  return `${text.slice(0, text.lastIndexOf(' ', limit) || limit).trimEnd()}…`;
}
