import { describe, expect, it } from 'vitest';

import { streamlineSchema, teamSchema } from '../src/lib/schema';
import type { StreamlineData, TeamData } from '../src/lib/schema';
import {
  applyToLedger,
  collectAnnouncements,
  emptyLedger,
  parseLedger,
  revertKeys,
  serializeLedger,
  streamlineUrl,
  type CollectInput,
  type Ledger,
} from './announcements';

/**
 * The question every one of these tests is really asking is "how many messages
 * would this have sent". A roadmap holds years of dated things, and the failure
 * that would kill the feature is not a missing announcement — it is fifty
 * arriving at once, after which somebody mutes the channel for good.
 */

const LIFECYCLE = [
  { id: 'proposed', label: 'Proposed' },
  { id: 'in-development', label: 'In development' },
  { id: 'rolling-out', label: 'Rolling out' },
  { id: 'generally-available', label: 'Generally available' },
  { id: 'deprecated', label: 'Deprecated' },
  { id: 'retired', label: 'Retired' },
];

const IMPACTS = [
  { id: 'breaking', label: 'Breaking' },
  { id: 'action-required', label: 'Action required' },
  { id: 'info', label: 'Info' },
];

const TODAY = new Date('2026-09-20T00:00:00Z');

function team(yaml: Record<string, unknown>): TeamData {
  return teamSchema.parse({ name: 'DevOps', mission: 'Runs the clusters.', ...yaml });
}

/** A streamline that is already known and has nothing new to say. */
function streamline(overrides: Record<string, unknown> = {}): StreamlineData {
  return streamlineSchema.parse({
    title: 'Kubernetes upgrade',
    team: 'devops',
    category: 'infrastructure',
    status: 'rolling-out',
    summary: 'Cluster-wide upgrade that affects workloads on removed beta APIs.',
    owners: [{ name: 'Jana Okafor' }],
    timeline: { proposed: '2026-01-15', 'rolling-out': '2026-09-15' },
    updates: [{ date: '2026-09-18', impact: 'info', title: 'Rollout has started' }],
    ...overrides,
  });
}

function collect(overrides: Partial<CollectInput> = {}) {
  const data = overrides.streamlines?.[0]?.data ?? streamline();

  return collectAnnouncements({
    streamlines: [{ id: 'devops/kubernetes-upgrade', data }],
    teams: new Map([['devops', team({ announceChannel: '#platform-news' })]]),
    ledger: emptyLedger(),
    today: TODAY,
    siteUrl: 'https://acme.github.io/signpost',
    locale: 'en-GB',
    lifecycle: LIFECYCLE,
    impactLevels: IMPACTS,
    ...overrides,
  });
}

/** Run once to seed, then again — the state every later test starts from. */
function seeded(data = streamline()): Ledger {
  const first = collect({ streamlines: [{ id: 'devops/kubernetes-upgrade', data }] });
  return applyToLedger(
    emptyLedger(),
    { seen: first.seeded, store: first.silent, drop: first.dropped },
    TODAY,
  );
}

describe('the first run', () => {
  it('says nothing at all, however much history it finds', () => {
    // The sample instance holds 54 dated timeline entries and 23 updates, 14 of
    // them in the future. A lookback window cannot help with a date in the
    // future, so the only safe first run is a silent one.
    const result = collect({
      streamlines: [
        {
          id: 'devops/kubernetes-upgrade',
          data: streamline({
            timeline: {
              proposed: '2024-01-15',
              'in-development': '2024-06-01',
              'rolling-out': '2025-03-01',
              'generally-available': '2026-11-02',
              deprecated: '2027-03-01',
              retired: '2028-01-01',
            },
            updates: [
              { date: '2024-02-01', impact: 'info', title: 'Work started' },
              { date: '2026-09-18', impact: 'breaking', title: 'Ingress v1beta1 is removed' },
            ],
          }),
        },
      ],
    });

    expect(result.announcements).toEqual([]);
    expect(result.seeded).toEqual(['devops/kubernetes-upgrade']);
    expect(result.silent).toHaveLength(8);
  });

  it('is quiet again on the second run, having written everything down', () => {
    const ledger = seeded();
    const result = collect({ ledger });

    expect(result.announcements).toEqual([]);
    expect(result.silent).toEqual([]);
    expect(result.seeded).toEqual([]);
  });
});

describe('a change to something already known', () => {
  it('announces a new update, with a link to it', () => {
    const ledger = seeded();
    const result = collect({
      ledger,
      streamlines: [
        {
          id: 'devops/kubernetes-upgrade',
          data: streamline({
            updates: [
              { date: '2026-09-18', impact: 'info', title: 'Rollout has started' },
              {
                date: '2026-09-19',
                impact: 'breaking',
                title: 'Ingress v1beta1 is removed',
                body: 'Move your manifests to `networking.k8s.io/v1` before the date.',
              },
            ],
          }),
        },
      ],
    });

    expect(result.announcements).toHaveLength(1);
    const [only] = result.announcements;
    expect(only?.channel).toBe('#platform-news');
    expect(only?.text).toContain(
      '<https://acme.github.io/signpost/streamlines/devops/kubernetes-upgrade/#update-2026-09-19-ingress-v1beta1-is-removed|Kubernetes upgrade> · DevOps',
    );
    expect(only?.text).toContain('*Ingress v1beta1 is removed* — Breaking, posted 19 September 2026.');
    expect(only?.text).toContain('Move your manifests to networking.k8s.io/v1 before the date.');
  });

  it('announces a newly dated stage as a date, whole message and all', () => {
    const ledger = seeded();
    const result = collect({
      ledger,
      streamlines: [
        {
          id: 'devops/kubernetes-upgrade',
          data: streamline({
            timeline: { proposed: '2026-01-15', 'rolling-out': '2026-09-15', retired: '2027-06-30' },
          }),
        },
      ],
    });

    // Seeded without a retirement date, so this is the first anyone hears of
    // one — a date, not a move. The whole message is asserted once, here,
    // because its shape is the contract: a link people can follow, the team
    // that owns it, and one sentence.
    expect(result.announcements.map((one) => one.text)).toEqual([
      '<https://acme.github.io/signpost/streamlines/devops/kubernetes-upgrade/|Kubernetes upgrade> · DevOps\nRetired on 30 June 2027.',
    ]);
  });

  it('never claims a streamline "is now" a stage, only that a date is a date', () => {
    // `status:` and `timeline:` are authored separately, so a message asserting
    // a state can contradict the badge on the page it links to. A date cannot.
    const ledger = seeded();
    const result = collect({
      ledger,
      streamlines: [
        {
          id: 'devops/kubernetes-upgrade',
          data: streamline({
            timeline: {
              proposed: '2026-01-15',
              'rolling-out': '2026-09-15',
              'generally-available': '2026-11-02',
            },
          }),
        },
      ],
    });

    expect(result.announcements[0]?.text).toContain('Generally available on 2 November 2026.');
    expect(result.announcements[0]?.text).not.toContain('is now');
  });

  it('announces a phase reaching a stage, saying who it is for', () => {
    const ledger = seeded();
    const result = collect({
      ledger,
      streamlines: [
        {
          id: 'devops/kubernetes-upgrade',
          data: streamline({
            phases: [
              {
                name: 'Phase 2',
                audience: 'Everyone else',
                status: 'rolling-out',
                timeline: { 'rolling-out': '2026-10-01' },
              },
            ],
          }),
        },
      ],
    });

    expect(result.announcements[0]?.text).toContain(
      'Phase 2, for Everyone else: Rolling out on 1 October 2026.',
    );
  });

  it('prefers an announcement override to the body it would have used', () => {
    const ledger = seeded();
    const result = collect({
      ledger,
      streamlines: [
        {
          id: 'devops/kubernetes-upgrade',
          data: streamline({
            updates: [
              { date: '2026-09-18', impact: 'info', title: 'Rollout has started' },
              {
                date: '2026-09-19',
                impact: 'breaking',
                title: 'Ingress v1beta1 is removed',
                body: 'A long explanation written for someone already reading the page.',
                announcement: 'Your manifests break on 2 November. There is a one-line fix.',
              },
            ],
          }),
        },
      ],
    });

    const text = result.announcements[0]?.text ?? '';
    expect(text).toContain('Your manifests break on 2 November. There is a one-line fix.');
    expect(text).not.toContain('already reading the page');
    // Still reachable: an override replaces the prose, never the way back.
    expect(text).toContain('#update-2026-09-19-ingress-v1beta1-is-removed|Kubernetes upgrade>');
  });
});

/**
 * A title is not shown by Slack, it is parsed. `&`, `<` and `>` are how mrkdwn
 * marks up links and mentions, so a streamline called "Q&A <beta>" arrives
 * mangled or half-missing unless the three are sent as entities — and the one
 * character the docs say nothing about, a `|` inside a link label, is left to
 * chance unless it never gets there.
 */
describe('text Slack would otherwise parse', () => {
  const TITLE = 'Q&A <beta> rollout | phase 1';

  /** Already known, under a title nobody sanitised on the way in. */
  const known = () => streamline({ title: TITLE });

  /** The same streamline, one update later. */
  const changed = () =>
    streamline({
      title: TITLE,
      updates: [
        { date: '2026-09-18', impact: 'info', title: 'Rollout has started' },
        {
          date: '2026-09-19',
          impact: 'breaking',
          title: 'Drop <legacy> & retire the | shim',
          announcement: 'Move off <legacy> before R&D switch it off.',
        },
      ],
    });

  const announce = () =>
    collect({
      ledger: seeded(known()),
      streamlines: [{ id: 'devops/kubernetes-upgrade', data: changed() }],
      teams: new Map([
        ['devops', team({ name: 'R&D <core>', announceChannel: '#platform-news' })],
      ]),
    });

  it('sends every field as entities, and keeps the pipe out of the link label', () => {
    const text = announce().announcements[0]?.text ?? '';

    // The pipe becomes a slash rather than a second delimiter of unknown effect.
    expect(text).toContain('|Q&amp;A &lt;beta&gt; rollout / phase 1> · R&amp;D &lt;core&gt;');
    expect(text).toContain('*Drop &lt;legacy&gt; &amp; retire the | shim*');
    expect(text).toContain('Move off &lt;legacy&gt; before R&amp;D switch it off.');
  });

  it('leaves nothing unescaped anywhere in the message', () => {
    // The invariant rather than a list of fields: the only angle brackets in a
    // message are the ones this file put around the link, and every `&` opens
    // one of the three entities. A field added later that forgets to escape
    // fails here without anyone having to remember to add a case.
    const text = announce().announcements[0]?.text ?? '';

    expect(text.match(/[<>]/g)).toEqual(['<', '>']);
    expect(text).not.toMatch(/&(?!amp;|lt;|gt;)/);
  });

  it('carries a body through whole, escaped rather than emptied', () => {
    // Both halves of the same sentence: flattening the Markdown keeps the
    // ampersand and the placeholder, and escaping them here is what makes
    // Slack show the characters instead of reading them as markup.
    const result = collect({
      ledger: seeded(),
      streamlines: [
        {
          id: 'devops/kubernetes-upgrade',
          data: streamline({
            updates: [
              { date: '2026-09-18', impact: 'info', title: 'Rollout has started' },
              {
                date: '2026-09-19',
                impact: 'breaking',
                title: 'Ingress v1beta1 is removed',
                body: 'Ask R&D first. Run `--context <your-cluster>` to see what breaks.',
              },
            ],
          }),
        },
      ],
    });

    expect(result.announcements[0]?.text).toContain(
      'Ask R&amp;D first. Run --context &lt;your-cluster&gt; to see what breaks.',
    );
  });

  it('escapes a phase name and its audience', () => {
    const result = collect({
      ledger: seeded(),
      streamlines: [
        {
          id: 'devops/kubernetes-upgrade',
          data: streamline({
            phases: [
              {
                name: 'Phase 2 <pilot>',
                audience: 'R&D and <everyone else>',
                status: 'rolling-out',
                timeline: { 'rolling-out': '2026-10-01' },
              },
            ],
          }),
        },
      ],
    });

    expect(result.announcements[0]?.text).toContain(
      'Phase 2 &lt;pilot&gt;, for R&amp;D and &lt;everyone else&gt;: Rolling out on 1 October 2026.',
    );
  });
});

describe('editing rather than adding', () => {
  it('treats a reworded title as the same update, and says nothing', () => {
    const ledger = seeded();

    const renamed = collect({
      ledger,
      streamlines: [
        {
          id: 'devops/kubernetes-upgrade',
          data: streamline({
            updates: [{ date: '2026-09-18', impact: 'info', title: 'The rollout has started' }],
          }),
        },
      ],
    });

    expect(renamed.announcements).toEqual([]);
    expect(renamed.dropped).toEqual(['devops/kubernetes-upgrade#update-2026-09-18-rollout-has-started#change']);
    expect(renamed.silent).toEqual([
      {
        key: 'devops/kubernetes-upgrade#update-2026-09-18-the-rollout-has-started#change',
        fingerprint: '2026-09-18|info',
      },
    ]);
  });

  it('announces once when a date moves, not once for the move and once for the arrival', () => {
    const ledger = seeded();
    const result = collect({
      ledger,
      streamlines: [
        {
          id: 'devops/kubernetes-upgrade',
          data: streamline({
            timeline: { proposed: '2026-01-15', 'rolling-out': '2026-09-28' },
          }),
        },
      ],
    });

    expect(result.announcements).toHaveLength(1);
    expect(result.announcements[0]?.text).toContain(
      'Rolling out moved from 15 September 2026 to 28 September 2026.',
    );
  });

  it('announces an impact that changed, even though no date moved', () => {
    const ledger = seeded();
    const result = collect({
      ledger,
      streamlines: [
        {
          id: 'devops/kubernetes-upgrade',
          data: streamline({
            updates: [{ date: '2026-09-18', impact: 'breaking', title: 'Rollout has started' }],
          }),
        },
      ],
    });

    expect(result.announcements[0]?.text).toContain('Breaking, was Info.');
  });
});

describe('the guards', () => {
  it('drops a change dated further back than the lookback window', () => {
    const ledger = seeded();
    const result = collect({
      ledger,
      lookbackDays: 14,
      streamlines: [
        {
          id: 'devops/kubernetes-upgrade',
          data: streamline({
            updates: [
              { date: '2026-09-18', impact: 'info', title: 'Rollout has started' },
              { date: '2025-04-01', impact: 'info', title: 'Backfilled from the old wiki' },
            ],
          }),
        },
      ],
    });

    expect(result.announcements).toEqual([]);
    // Recorded, so it is old news exactly once rather than every morning.
    expect(result.silent).toHaveLength(1);
  });

  it('announces something far in the future, which no window on the past can catch', () => {
    const ledger = seeded();
    const result = collect({
      ledger,
      streamlines: [
        {
          id: 'devops/kubernetes-upgrade',
          data: streamline({
            timeline: { proposed: '2026-01-15', 'rolling-out': '2026-09-15', retired: '2029-01-01' },
          }),
        },
      ],
    });

    expect(result.announcements).toHaveLength(1);
  });

  it('caps a run and leaves the rest for the next one, oldest first', () => {
    const ledger = seeded();
    const result = collect({
      ledger,
      maxPerRun: 2,
      streamlines: [
        {
          id: 'devops/kubernetes-upgrade',
          data: streamline({
            timeline: {
              proposed: '2026-01-15',
              'rolling-out': '2026-09-15',
              'generally-available': '2026-11-02',
              deprecated: '2027-01-01',
              retired: '2027-06-30',
            },
          }),
        },
      ],
    });

    expect(result.announcements).toHaveLength(2);
    expect(result.withheld).toBe(1);
    expect(result.announcements.map((a) => a.date.toISOString().slice(0, 10))).toEqual([
      '2026-11-02',
      '2027-01-01',
    ]);
    // What was held back is not written down, so the next run still has it.
    expect(result.silent).toEqual([]);
  });

  it('keeps a muted streamline quiet, and remembers what it kept quiet about', () => {
    const ledger = seeded();
    const result = collect({
      ledger,
      streamlines: [
        {
          id: 'devops/kubernetes-upgrade',
          data: streamline({
            announce: false,
            timeline: { proposed: '2026-01-15', 'rolling-out': '2026-09-15', retired: '2027-06-30' },
          }),
        },
      ],
    });

    expect(result.announcements).toEqual([]);
    expect(result.silent).toEqual([
      { key: 'devops/kubernetes-upgrade#stage-retired#change', fingerprint: '2027-06-30' },
    ]);
  });

  it('reports a streamline with nowhere to send, rather than dropping it quietly', () => {
    const ledger = seeded();
    const result = collect({
      ledger,
      teams: new Map([['devops', team({})]]),
      streamlines: [
        {
          id: 'devops/kubernetes-upgrade',
          data: streamline({
            timeline: { proposed: '2026-01-15', 'rolling-out': '2026-09-15', retired: '2027-06-30' },
          }),
        },
      ],
    });

    expect(result.announcements).toEqual([]);
    expect(result.unroutable).toEqual(['devops/kubernetes-upgrade']);
    // Not recorded either: it is still unsaid, and will be sent once there is
    // somewhere to send it.
    expect(result.silent).toEqual([]);
  });

  it('lets a streamline override its team’s channel', () => {
    const ledger = seeded();
    const result = collect({
      ledger,
      streamlines: [
        {
          id: 'devops/kubernetes-upgrade',
          data: streamline({
            announceChannel: '#kubernetes',
            timeline: { proposed: '2026-01-15', 'rolling-out': '2026-09-15', retired: '2027-06-30' },
          }),
        },
      ],
    });

    expect(result.announcements[0]?.channel).toBe('#kubernetes');
  });

  it('falls back to the site channel when neither names one', () => {
    const ledger = seeded();
    const result = collect({
      ledger,
      channel: '#everything',
      teams: new Map([['devops', team({})]]),
      streamlines: [
        {
          id: 'devops/kubernetes-upgrade',
          data: streamline({
            timeline: { proposed: '2026-01-15', 'rolling-out': '2026-09-15', retired: '2027-06-30' },
          }),
        },
      ],
    });

    expect(result.announcements[0]?.channel).toBe('#everything');
  });
});

describe('the ledger', () => {
  it('refuses a version it cannot reason about', () => {
    // Treating unreadable keys as missing keys would announce the whole roadmap.
    expect(() => parseLedger(JSON.stringify({ version: 99, streamlines: {}, entries: {} }))).toThrow(
      /Refusing to announce/,
    );
  });

  it('writes its keys in order, so a diff shows only what changed', () => {
    const ledger = applyToLedger(
      emptyLedger(),
      {
        seen: ['b/two', 'a/one'],
        store: [
          { key: 'b/two#stage-retired#change', fingerprint: '2027-01-01' },
          { key: 'a/one#stage-retired#change', fingerprint: '2026-01-01' },
        ],
      },
      TODAY,
    );

    const text = serializeLedger(ledger);
    expect(text.indexOf('"a/one"')).toBeLessThan(text.indexOf('"b/two"'));
    expect(text.indexOf('a/one#stage-retired')).toBeLessThan(text.indexOf('b/two#stage-retired'));
    expect(parseLedger(text)).toEqual(ledger);
  });

  it('puts a key back the way it was when its message never went out', () => {
    // The run writes every key down before it posts anything, so a push that
    // fails means nothing was sent. The price is undoing the ones that were
    // written but never made it.
    const before = applyToLedger(
      emptyLedger(),
      { store: [{ key: 'a/one#stage-retired#change', fingerprint: '2026-01-01' }] },
      TODAY,
    );

    const reserved = applyToLedger(
      before,
      {
        store: [
          { key: 'a/one#stage-retired#change', fingerprint: '2027-01-01' },
          { key: 'a/one#stage-deprecated#change', fingerprint: '2026-06-01' },
        ],
      },
      TODAY,
    );

    const reverted = revertKeys(reserved, before, [
      'a/one#stage-retired#change',
      'a/one#stage-deprecated#change',
    ]);

    expect(reverted.entries['a/one#stage-retired#change']?.fingerprint).toBe('2026-01-01');
    expect(reverted.entries['a/one#stage-deprecated#change']).toBeUndefined();
  });
});

describe('links', () => {
  it('builds a link for a site published at a root', () => {
    expect(streamlineUrl('devops/kubernetes-upgrade', 'https://roadmap.acme.com')).toBe(
      'https://roadmap.acme.com/streamlines/devops/kubernetes-upgrade/',
    );
  });

  it('builds a link for a site published under a base path', () => {
    expect(streamlineUrl('devops/kubernetes-upgrade', 'https://acme.github.io/signpost')).toBe(
      'https://acme.github.io/signpost/streamlines/devops/kubernetes-upgrade/',
    );
  });
});
