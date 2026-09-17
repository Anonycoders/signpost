import { DOMParser, type Document, type Element } from '@xmldom/xmldom';
import { describe, expect, it } from 'vitest';

import { buildAtomFeed, escapeXml, rfc3339, type AtomEntry } from './atom';

/**
 * A malformed feed fails silently — readers simply stop updating, and nobody
 * finds out for months. These tests stand in for that missing feedback: every
 * case parses the document with a real XML parser (which throws on anything
 * not well-formed) and then checks the elements RFC 4287 calls required.
 */

const entry = (overrides: Partial<AtomEntry> = {}): AtomEntry => ({
  id: 'https://signpost.example.com/streamlines/devops/jenkins/#update-2026-09-10',
  title: 'Jenkins is being retired',
  updated: new Date('2026-09-10T00:00:00Z'),
  link: 'https://signpost.example.com/streamlines/devops/jenkins/',
  ...overrides,
});

const feed = (entries: AtomEntry[], overrides: Record<string, unknown> = {}) =>
  buildAtomFeed({
    id: 'https://signpost.example.com/',
    title: 'Signpost',
    subtitle: 'What the platform teams are building.',
    self: 'https://signpost.example.com/feed.xml',
    alternate: 'https://signpost.example.com/',
    author: 'Example Organization',
    language: 'en-GB',
    entries,
    ...overrides,
  });

/** Parsing is the real assertion: a feed reader will do exactly this. */
const parse = (xml: string): Document =>
  new DOMParser().parseFromString(xml, 'application/xml');

/**
 * Direct children only. `feed` and `entry` both have a `title` and an
 * `updated`, so a document-wide search would happily assert against the wrong
 * one and pass.
 */
function childrenOf(parent: Element, tag: string): Element[] {
  const found: Element[] = [];

  for (let i = 0; i < parent.childNodes.length; i += 1) {
    const node = parent.childNodes[i];
    if (node && node.nodeType === 1 && (node as Element).tagName === tag) {
      found.push(node as Element);
    }
  }

  return found;
}

const child = (parent: Element, tag: string): Element | undefined => childrenOf(parent, tag)[0];

const childText = (parent: Element, tag: string): string | null =>
  child(parent, tag)?.textContent ?? null;

const linkWithRel = (parent: Element, rel: string): Element | undefined =>
  childrenOf(parent, 'link').find((link) => link.getAttribute('rel') === rel);

const rootOf = (xml: string): Element => parse(xml).documentElement as Element;

const firstEntry = (xml: string): Element => {
  const found = child(rootOf(xml), 'entry');
  if (!found) throw new Error('the feed has no entries');
  return found;
};

describe('escapeXml', () => {
  it('escapes the five characters that would otherwise change the markup', () => {
    expect(escapeXml(`<a href="x">Tom & Jerry's</a>`)).toBe(
      '&lt;a href=&quot;x&quot;&gt;Tom &amp; Jerry&apos;s&lt;/a&gt;',
    );
  });

  it('escapes an existing entity again rather than leaving it live', () => {
    expect(escapeXml('R&D &amp; friends')).toBe('R&amp;D &amp;amp; friends');
  });
});

describe('rfc3339', () => {
  it('emits a UTC timestamp with a zone designator', () => {
    expect(rfc3339(new Date('2026-09-10T00:00:00Z'))).toBe('2026-09-10T00:00:00.000Z');
  });
});

describe('buildAtomFeed', () => {
  it('produces a parseable document in the Atom namespace', () => {
    const root = rootOf(feed([entry()]));

    expect(root.tagName).toBe('feed');
    expect(root.namespaceURI).toBe('http://www.w3.org/2005/Atom');
  });

  it('carries every element the spec requires of a feed', () => {
    const root = rootOf(feed([entry()]));

    expect(childText(root, 'id')).toBe('https://signpost.example.com/');
    expect(childText(root, 'title')).toBe('Signpost');
    expect(childText(root, 'updated')).toBe('2026-09-10T00:00:00.000Z');

    const author = child(root, 'author');
    expect(author && childText(author, 'name')).toBe('Example Organization');
  });

  it('links to itself and to the page it accompanies, as readers expect', () => {
    const root = rootOf(feed([entry()]));

    const self = linkWithRel(root, 'self');
    expect(self?.getAttribute('href')).toBe('https://signpost.example.com/feed.xml');
    expect(self?.getAttribute('type')).toBe('application/atom+xml');

    expect(linkWithRel(root, 'alternate')?.getAttribute('href')).toBe(
      'https://signpost.example.com/',
    );
  });

  it('carries every element the spec requires of an entry', () => {
    const item = firstEntry(feed([entry()]));

    expect(childText(item, 'id')).toContain('#update-2026-09-10');
    expect(childText(item, 'title')).toBe('Jenkins is being retired');
    expect(childText(item, 'updated')).toBe('2026-09-10T00:00:00.000Z');
    expect(linkWithRel(item, 'alternate')?.getAttribute('href')).toBe(
      'https://signpost.example.com/streamlines/devops/jenkins/',
    );
  });

  it('dates the feed from its newest entry, not from the build', () => {
    const root = rootOf(
      feed([
        entry({ id: 'a', updated: new Date('2026-03-01T00:00:00Z') }),
        entry({ id: 'b', updated: new Date('2026-09-10T00:00:00Z') }),
        entry({ id: 'c', updated: new Date('2026-06-01T00:00:00Z') }),
      ]),
    );

    expect(childText(root, 'updated')).toBe('2026-09-10T00:00:00.000Z');
  });

  it('stays well-formed when a feed has no entries at all', () => {
    const root = rootOf(feed([]));

    expect(childrenOf(root, 'entry')).toHaveLength(0);
    expect(childText(root, 'updated')).toBeTruthy();
  });

  it('round-trips HTML content rather than letting it break the document', () => {
    const item = firstEntry(
      feed([entry({ content: '<p>Migrate before <strong>1 October</strong>.</p>' })]),
    );

    const content = child(item, 'content');
    expect(content?.getAttribute('type')).toBe('html');
    // Parsed back out the markup is intact, because it travelled as escaped text.
    expect(content?.textContent).toBe('<p>Migrate before <strong>1 October</strong>.</p>');
  });

  it('survives an ampersand in a title, which is what usually breaks feeds', () => {
    expect(childText(firstEntry(feed([entry({ title: 'CI & CD <v2> "final"' })])), 'title')).toBe(
      'CI & CD <v2> "final"',
    );
  });

  it('drops control characters that XML has no way to represent', () => {
    const title = `Bell${String.fromCharCode(7)} and NUL${String.fromCharCode(0)}`;

    expect(childText(firstEntry(feed([entry({ title })])), 'title')).toBe('Bell and NUL');
  });

  it('keeps tabs, newlines and non-ASCII text', () => {
    const summary = 'Über\tdie\nBrücke — 100% ✅';

    expect(childText(firstEntry(feed([entry({ summary })])), 'summary')).toBe(summary);
  });

  it('falls back to the feed author for an entry that names none', () => {
    const author = child(firstEntry(feed([entry()])), 'author');

    expect(author && childText(author, 'name')).toBe('Example Organization');
  });

  it('names the entry authors when it has them', () => {
    const item = firstEntry(feed([entry({ authors: ['Jana Okafor', 'Sam Reid'] })]));

    const names = childrenOf(item, 'author').map((author) => childText(author, 'name'));
    expect(names).toEqual(['Jana Okafor', 'Sam Reid']);
  });

  it('tags entries with their categories', () => {
    const item = firstEntry(feed([entry({ categories: ['DevOps', 'Infrastructure'] })]));

    const terms = childrenOf(item, 'category').map((category) => category.getAttribute('term'));
    expect(terms).toEqual(['DevOps', 'Infrastructure']);
  });

  it('declares the language so readers can speak and hyphenate it correctly', () => {
    expect(rootOf(feed([entry()])).getAttribute('xml:lang')).toBe('en-GB');
  });

  it('omits the subtitle rather than emitting an empty one', () => {
    expect(child(rootOf(feed([entry()], { subtitle: undefined })), 'subtitle')).toBeUndefined();
  });

  it('starts with an XML declaration, since some readers insist on one', () => {
    expect(feed([entry()]).startsWith('<?xml version="1.0" encoding="utf-8"?>')).toBe(true);
  });
});
