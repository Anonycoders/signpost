/**
 * Atom 1.0 feed generation (RFC 4287).
 *
 * Hand-written rather than pulled from a package: the whole document is four
 * elements deep, and doing it here means the feed is unit-tested and the
 * required bits — a stable `id` on every entry, RFC 3339 timestamps, a
 * `rel="self"` link — cannot quietly go missing.
 *
 * Atom rather than RSS 2.0 because dates in Atom are unambiguous and every
 * entry carries a stable identity independent of its URL, which matters for a
 * feed whose whole job is telling people a deprecation is coming.
 *
 * Everything here takes absolute URLs; callers build those from `Astro.site`.
 */

export interface AtomEntry {
  /** Stable, globally unique IRI. Must never change once published. */
  id: string;
  title: string;
  /** Last meaningful change to this entry. */
  updated: Date;
  /** Absolute URL of the page this entry is about. */
  link: string;
  /** Plain text. */
  summary?: string;
  /** HTML fragment, escaped into `<content type="html">`. */
  content?: string;
  authors?: string[];
  categories?: string[];
}

export interface AtomFeedOptions {
  /** Stable IRI for the feed itself, conventionally the site URL. */
  id: string;
  title: string;
  subtitle?: string;
  /** Absolute URL this feed document is served from. */
  self: string;
  /** Absolute URL of the HTML page this feed accompanies. */
  alternate: string;
  /** Fallback author, used for entries that name none. */
  author: string;
  language?: string;
  entries: AtomEntry[];
  /**
   * Feed timestamp. Defaults to the newest entry, so a rebuild that changed
   * nothing does not tell every reader the feed is new.
   */
  updated?: Date;
}

/**
 * Escape text for an XML text node or attribute.
 *
 * Apostrophes are escaped too. They only strictly need it inside
 * single-quoted attributes, but a feed reader parsing loosely is not worth the
 * gamble for four extra characters.
 */
export function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Drop the characters XML 1.0 forbids outright — control characters other than
 * tab, newline and carriage return, and the two non-characters at the end of
 * the basic plane.
 *
 * A stray control character from a copy-pasted terminal session makes the whole
 * document unparseable, and a feed reader's only feedback for that is silence.
 * Written as a filter rather than a regexp so the source file itself stays free
 * of literal control characters.
 */
function stripInvalid(value: string): string {
  let out = '';

  for (const char of value) {
    const code = char.codePointAt(0) ?? 0;
    const allowed =
      code === 0x09 ||
      code === 0x0a ||
      code === 0x0d ||
      (code >= 0x20 && code <= 0xd7ff && code !== 0x7f) ||
      (code >= 0xe000 && code <= 0xfffd) ||
      code >= 0x10000;

    if (allowed) out += char;
  }

  return out;
}

const text = (value: string): string => escapeXml(stripInvalid(value));

/** RFC 3339, which is what Atom requires. */
export const rfc3339 = (date: Date): string => date.toISOString();

function entryXml(entry: AtomEntry, fallbackAuthor: string): string {
  const parts = [
    `    <title type="text">${text(entry.title)}</title>`,
    `    <id>${text(entry.id)}</id>`,
    `    <link rel="alternate" type="text/html" href="${text(entry.link)}"/>`,
    `    <updated>${rfc3339(entry.updated)}</updated>`,
  ];

  const authors = entry.authors?.length ? entry.authors : [fallbackAuthor];
  for (const author of authors) {
    parts.push(`    <author><name>${text(author)}</name></author>`);
  }

  for (const category of entry.categories ?? []) {
    parts.push(`    <category term="${text(category)}"/>`);
  }

  if (entry.summary) {
    parts.push(`    <summary type="text">${text(entry.summary)}</summary>`);
  }

  if (entry.content) {
    parts.push(`    <content type="html">${text(entry.content)}</content>`);
  }

  return `  <entry>\n${parts.join('\n')}\n  </entry>`;
}

export function buildAtomFeed(options: AtomFeedOptions): string {
  const newest = options.entries.reduce<Date | undefined>(
    (latest, entry) => (!latest || entry.updated > latest ? entry.updated : latest),
    undefined,
  );

  // An empty feed still needs a timestamp; the epoch would be a lie, so fall
  // back to build time — the only honest answer for "nothing has happened yet".
  const updated = options.updated ?? newest ?? new Date();

  const head = [
    `  <title type="text">${text(options.title)}</title>`,
    options.subtitle ? `  <subtitle type="text">${text(options.subtitle)}</subtitle>` : null,
    `  <id>${text(options.id)}</id>`,
    `  <link rel="self" type="application/atom+xml" href="${text(options.self)}"/>`,
    `  <link rel="alternate" type="text/html" href="${text(options.alternate)}"/>`,
    `  <updated>${rfc3339(updated)}</updated>`,
    `  <author><name>${text(options.author)}</name></author>`,
  ].filter((line): line is string => line !== null);

  const body = options.entries.map((entry) => entryXml(entry, options.author));

  const langAttr = options.language ? ` xml:lang="${text(options.language)}"` : '';

  return [
    '<?xml version="1.0" encoding="utf-8"?>',
    `<feed xmlns="http://www.w3.org/2005/Atom"${langAttr}>`,
    ...head,
    ...body,
    '</feed>',
    '',
  ].join('\n');
}

/** The response every feed endpoint returns, so the headers match everywhere. */
export function atomResponse(xml: string): Response {
  return new Response(xml, {
    headers: {
      'Content-Type': 'application/atom+xml; charset=utf-8',
    },
  });
}
