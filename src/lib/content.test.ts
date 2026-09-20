import { beforeAll, describe, expect, it, vi } from 'vitest';

import { streamlineSchema } from './schema';

/**
 * How a streamline's rollout phases arrive at a page.
 *
 * Content files carry stage ids and dates; pages want stage objects with labels
 * and tones, in lifecycle order. The join happens once, in content.ts, and this
 * is the test of that join — the collection itself is stubbed, because what is
 * under test is the resolution, not Astro's loader.
 */

/** A streamline file as an author would write it, parsed by the real schema. */
function streamlineData(overrides: Record<string, unknown> = {}) {
  return streamlineSchema.parse({
    title: 'Kubernetes upgrade',
    summary: 'Moving every cluster to 1.31.',
    team: 'devops',
    status: 'rolling-out',
    category: 'infrastructure',
    owners: [{ name: 'Alex Kim' }],
    timeline: { 'in-development': new Date('2026-01-15') },
    updates: [],
    ...overrides,
  });
}

const entries = {
  teams: [
    {
      id: 'devops',
      data: { name: 'DevOps', mission: 'Keep the platform boring.', links: [] },
    },
  ],
  docs: [] as unknown[],
  streamlines: [
    {
      id: 'devops/phased',
      body: '',
      data: streamlineData({
        phases: [
          {
            name: 'Phase 1',
            audience: 'Pilot teams',
            // Written out of lifecycle order on purpose: the reader gets it
            // back in order regardless of how the file was typed.
            timeline: { 'generally-available': '2026-04-01', 'rolling-out': '2026-02-01' },
            status: 'generally-available',
          },
          { name: 'Phase 2', audience: 'Everyone else', status: 'proposed' },
        ],
      }),
    },
    {
      id: 'devops/unphased',
      body: '',
      data: streamlineData({ title: 'Shared runners' }),
    },
    {
      id: 'devops/cached-before-phases',
      body: '',
      /*
       * An entry as Astro's content cache holds it from before this feature
       * existed: no `phases` key at all, because the schema that parsed it had
       * none. Entries are cached by file digest, so an unchanged content file
       * is never re-parsed and the schema default never runs for it.
       */
      data: (() => {
        const data = streamlineData({ title: 'Wiki search' }) as Record<string, unknown>;
        delete data.phases;
        return data;
      })(),
    },
  ],
};

vi.mock('astro:content', () => ({
  getCollection: vi.fn(async (name: 'teams' | 'streamlines' | 'docs') => entries[name]),
}));

let phased: Awaited<ReturnType<typeof import('./content').getStreamline>>;
let unphased: Awaited<ReturnType<typeof import('./content').getStreamline>>;
let cached: Awaited<ReturnType<typeof import('./content').getStreamline>>;

beforeAll(async () => {
  const { getStreamline } = await import('./content');
  phased = await getStreamline('devops/phased');
  unphased = await getStreamline('devops/unphased');
  cached = await getStreamline('devops/cached-before-phases');
});

describe('streamline phases', () => {
  it('gives a streamline with no phases an empty array, so no page branches on undefined', () => {
    expect(unphased?.phases).toEqual([]);
  });

  it('survives an entry cached before phases existed, rather than crashing on upgrade', () => {
    // The schema default cannot help here: it runs when a file is parsed, and
    // this entry is one the content cache is holding from an older schema.
    expect(cached?.phases).toEqual([]);
    expect(cached?.title).toBe('Wiki search');
  });

  it('keeps the phases in the order the author wrote them', () => {
    expect(phased?.phases.map((phase) => phase.name)).toEqual(['Phase 1', 'Phase 2']);
  });

  it('carries the audience through untouched', () => {
    expect(phased?.phases.map((phase) => phase.audience)).toEqual(['Pilot teams', 'Everyone else']);
  });

  it('resolves a phase status into the configured stage, with its label and tone', () => {
    expect(phased?.phases[0]?.stage).toMatchObject({
      id: 'generally-available',
      label: 'Generally available',
      tone: 'green',
    });
    expect(phased?.phases[1]?.stage.id).toBe('proposed');
  });

  it('resolves a phase timeline into dates, in lifecycle order', () => {
    expect(phased?.phases[0]?.timeline.map((entry) => entry.stage.id)).toEqual([
      'rolling-out',
      'generally-available',
    ]);
    expect(phased?.phases[0]?.timeline.map((entry) => entry.date)).toEqual([
      new Date('2026-02-01'),
      new Date('2026-04-01'),
    ]);
  });

  it('gives a phase with no dates an empty timeline', () => {
    expect(phased?.phases[1]?.timeline).toEqual([]);
  });

  it('leaves the streamline’s own status and timeline alone', () => {
    expect(phased?.stage.id).toBe('rolling-out');
    expect(phased?.timeline).toEqual([
      { stage: expect.objectContaining({ id: 'in-development' }), date: new Date('2026-01-15') },
    ]);
  });
});

/**
 * Turning a Slack handle into a link.
 *
 * Pure, and tested here rather than through a page, because the interesting
 * part is the set of ways it can decline to build a URL. Slack will not resolve
 * a display name, so every one of those refusals is the honest answer — a link
 * that lands nowhere costs the reader a click they cannot get back.
 */
describe('slackProfileUrl', () => {
  it('builds a workspace profile link', async () => {
    const { slackProfileUrl } = await import('./content');

    expect(slackProfileUrl('U024BE7LH', 'https://acmeco.slack.com')).toBe(
      'https://acmeco.slack.com/team/U024BE7LH',
    );
  });

  it('addresses an Enterprise Grid member the way Grid does', async () => {
    // Different path, and an @ the workspace form does not use. Both are
    // Slack's own; getting this wrong sends half the large orgs to a 404.
    const { slackProfileUrl } = await import('./content');

    expect(slackProfileUrl('W1H63D8SZ', 'https://acmeorg.enterprise.slack.com')).toBe(
      'https://acmeorg.enterprise.slack.com/user/@W1H63D8SZ',
    );
  });

  it('declines when no workspace is configured', async () => {
    const { slackProfileUrl } = await import('./content');

    expect(slackProfileUrl('U024BE7LH', undefined)).toBeUndefined();
    expect(slackProfileUrl('U024BE7LH', '')).toBeUndefined();
  });

  it('declines rather than guessing when the workspace is not a URL', async () => {
    const { slackProfileUrl } = await import('./content');

    expect(slackProfileUrl('U024BE7LH', 'acmeco')).toBeUndefined();
  });

  it('ignores a path on the configured workspace', async () => {
    // Someone will paste the URL with a trailing path on it. The member lives
    // at the root of the workspace either way.
    const { slackProfileUrl } = await import('./content');

    expect(slackProfileUrl('U024BE7LH', 'https://acmeco.slack.com/archives/C123')).toBe(
      'https://acmeco.slack.com/team/U024BE7LH',
    );
  });
});
