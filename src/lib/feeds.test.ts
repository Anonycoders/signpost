import { DOMParser } from '@xmldom/xmldom';
import { describe, expect, it } from 'vitest';

import { buildAtomFeed } from './atom';
import { toEntries, type FeedUpdate } from './feeds';

/**
 * A feed entry passes through two escapings on its way to a reader: the body is
 * rendered as HTML and flattened back to text, and then the whole document is
 * written as XML. Each is right on its own, and the question these tests ask is
 * what a reader ends up looking at after both.
 *
 * It is the summary rather than the content, because the summary is the line a
 * reader shows in its list — the one somebody reads before deciding whether to
 * open anything at all.
 */

const SITE = new URL('https://acme.github.io/signpost/');

const update = (overrides: Partial<FeedUpdate> = {}): FeedUpdate => ({
  date: new Date('2026-09-10T00:00:00Z'),
  title: 'Ingress v1beta1 is removed',
  impact: { label: 'Breaking' },
  streamline: {
    title: 'Kubernetes upgrade',
    href: '/streamlines/devops/kubernetes-upgrade/',
    team: { name: 'DevOps' },
    category: { label: 'Infrastructure' },
    owners: [{ name: 'Jana Okafor' }],
  },
  ...overrides,
});

const feed = (updates: FeedUpdate[]) =>
  buildAtomFeed({
    id: 'https://acme.github.io/signpost/',
    title: 'Signpost',
    subtitle: 'What the platform teams are building.',
    self: 'https://acme.github.io/signpost/feed.xml',
    alternate: 'https://acme.github.io/signpost/',
    author: 'Example Organization',
    language: 'en-GB',
    entries: toEntries(updates, SITE),
  });

const BODY = 'Ask R&D first. Run `--context <your-cluster>` to see what breaks.';
const READS = 'Ask R&D first. Run --context <your-cluster> to see what breaks.';

describe('a summary with characters HTML and XML both care about', () => {
  it('says what the author wrote', () => {
    const [entry] = toEntries([update({ body: BODY })], SITE);

    expect(entry?.summary).toBe(READS);
  });

  it('is escaped once in the document, and reads as written once parsed', () => {
    const xml = feed([update({ body: BODY })]);

    // Escaped on the way out — a raw `&` here would be a document no reader
    // can parse, and the whole feed would stop updating with nothing said.
    expect(xml).toContain('Ask R&amp;D first.');
    expect(xml).toContain('--context &lt;your-cluster&gt;');

    // And unescaped again by the reader, which is the only view that matters.
    const parsed = new DOMParser().parseFromString(xml, 'application/xml');
    const summary = parsed.getElementsByTagName('summary')[0];

    expect(summary?.textContent).toBe(READS);
  });
});
