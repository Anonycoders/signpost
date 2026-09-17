import { describe, expect, it } from 'vitest';

import type { ImpactLevel, LifecycleStage } from '@config';
import { buildChangeFeed, needsAttention, type ChangeSubject, type ChangeUpdate } from './changes';

const stage = (id: string): LifecycleStage => ({ id, label: id, description: '', tone: 'gray' });
const utc = (iso: string): Date => new Date(`${iso}T00:00:00.000Z`);

const breaking: ImpactLevel = {
  id: 'breaking',
  label: 'Breaking',
  description: '',
  tone: 'red',
  weight: 30,
};
const actionRequired: ImpactLevel = {
  id: 'action-required',
  label: 'Action required',
  description: '',
  tone: 'amber',
  weight: 20,
};
const info: ImpactLevel = { id: 'info', label: 'Info', description: '', tone: 'blue', weight: 10 };

const update = (iso: string, impact: ImpactLevel, title = 'An update'): ChangeUpdate => ({
  date: utc(iso),
  title,
  impact,
  stage: stage('rolling-out'),
});

function subject(overrides: Partial<ChangeSubject> = {}): ChangeSubject {
  return {
    id: 'devops/k8s',
    title: 'Kubernetes upgrade',
    href: '/streamlines/devops/k8s/',
    team: { slug: 'devops', name: 'DevOps', href: '/teams/devops/' },
    category: { id: 'infrastructure' },
    timeline: [],
    updates: [],
    ...overrides,
  };
}

const today = utc('2026-09-17');

describe('buildChangeFeed', () => {
  it('puts a future planned transition in upcoming', () => {
    const feed = buildChangeFeed(
      [subject({ timeline: [{ stage: stage('generally-available'), date: utc('2026-11-16') }] })],
      today,
      30,
    );

    expect(feed.upcoming).toHaveLength(1);
    expect(feed.upcoming[0]!.items[0]).toMatchObject({ kind: 'transition' });
  });

  it('surfaces a future breaking update in upcoming', () => {
    // The M3 acceptance criterion, asserted directly.
    const feed = buildChangeFeed(
      [subject({ updates: [update('2026-10-01', breaking, 'Ingress v1beta1 removed')] })],
      today,
      30,
    );

    const titles = feed.upcoming.flatMap((group) =>
      group.items.filter((item) => item.kind === 'update').map((item) => item.update.title),
    );
    expect(titles).toContain('Ingress v1beta1 removed');
  });

  it('files an update under its effective date, not the day it was posted', () => {
    // A deprecation announced six weeks early belongs in "still to come" until
    // the switch-off, not in "recently changed" the week after it was written.
    const announced = update('2026-09-10', breaking, 'Ingress v1beta1 removed');
    const feed = buildChangeFeed(
      [subject({ updates: [{ ...announced, effective: utc('2026-10-01') }] })],
      today,
      30,
    );

    expect(feed.recent).toEqual([]);
    expect(feed.upcoming.map((group) => group.key)).toEqual(['2026-10']);
    expect(feed.upcoming[0]!.items[0]!.date.toISOString()).toBe('2026-10-01T00:00:00.000Z');
  });

  it('keeps the posting date on the update itself, so a row can show both', () => {
    const announced = update('2026-09-10', breaking);
    const feed = buildChangeFeed(
      [subject({ updates: [{ ...announced, effective: utc('2026-10-01') }] })],
      today,
      30,
    );

    const item = feed.upcoming[0]!.items[0]!;
    expect(item.kind === 'update' && item.update.date.toISOString()).toBe(
      '2026-09-10T00:00:00.000Z',
    );
  });

  it('merges transitions and updates into one chronological list', () => {
    const feed = buildChangeFeed(
      [
        subject({
          timeline: [{ stage: stage('deprecated'), date: utc('2026-10-20') }],
          updates: [update('2026-10-05', info), update('2026-11-02', actionRequired)],
        }),
      ],
      today,
      30,
    );

    const dates = feed.upcoming.flatMap((group) =>
      group.items.map((item) => item.date.toISOString().slice(0, 10)),
    );
    expect(dates).toEqual(['2026-10-05', '2026-10-20', '2026-11-02']);
  });

  it('groups upcoming items by month, earliest month first', () => {
    const feed = buildChangeFeed(
      [
        subject({
          updates: [update('2027-01-05', info), update('2026-10-05', info), update('2026-12-01', info)],
        }),
      ],
      today,
      30,
    );

    expect(feed.upcoming.map((group) => group.key)).toEqual(['2026-10', '2026-12', '2027-01']);
  });

  it('leads with the most consequential item when several share a date', () => {
    const feed = buildChangeFeed(
      [
        subject({
          updates: [
            update('2026-10-05', info, 'Just so you know'),
            update('2026-10-05', breaking, 'This will break you'),
          ],
        }),
      ],
      today,
      30,
    );

    expect(feed.upcoming[0]!.items[0]).toMatchObject({ kind: 'update' });
    const first = feed.upcoming[0]!.items[0];
    expect(first.kind === 'update' && first.update.title).toBe('This will break you');
  });

  it('puts items from the recent window in recent, newest first', () => {
    const feed = buildChangeFeed(
      [subject({ updates: [update('2026-09-10', info), update('2026-09-14', info)] })],
      today,
      30,
    );

    expect(feed.upcoming).toEqual([]);
    expect(feed.recent.map((item) => item.date.toISOString().slice(0, 10))).toEqual([
      '2026-09-14',
      '2026-09-10',
    ]);
  });

  it('excludes anything older than the recent window', () => {
    const feed = buildChangeFeed([subject({ updates: [update('2026-01-01', breaking)] })], today, 30);
    expect(feed.recent).toEqual([]);
    expect(feed.upcoming).toEqual([]);
  });

  it('counts something dated today as recent, not upcoming', () => {
    const feed = buildChangeFeed([subject({ updates: [update('2026-09-17', info)] })], today, 30);
    expect(feed.upcoming).toEqual([]);
    expect(feed.recent).toHaveLength(1);
  });

  it('includes recent transitions, not just updates', () => {
    const feed = buildChangeFeed(
      [subject({ timeline: [{ stage: stage('rolling-out'), date: utc('2026-09-01') }] })],
      today,
      30,
    );
    expect(feed.recent[0]).toMatchObject({ kind: 'transition' });
  });

  it('spans several streamlines', () => {
    const feed = buildChangeFeed(
      [
        subject({ id: 'a', updates: [update('2026-10-01', info)] }),
        subject({ id: 'b', updates: [update('2026-10-02', info)] }),
      ],
      today,
      30,
    );
    expect(feed.upcoming[0]!.items.map((item) => item.streamline.id)).toEqual(['a', 'b']);
  });
});

describe('needsAttention', () => {
  it('keeps high-impact items inside the window', () => {
    const items = needsAttention(
      [subject({ updates: [update('2026-10-01', breaking, 'Breaks soon')] })],
      today,
      60,
      20,
    );
    expect(items).toHaveLength(1);
  });

  it('drops items below the weight bar', () => {
    const items = needsAttention([subject({ updates: [update('2026-10-01', info)] })], today, 60, 20);
    expect(items).toEqual([]);
  });

  it('measures the horizon from the effective date', () => {
    const announced = update('2026-09-10', breaking);
    const items = needsAttention(
      [subject({ updates: [{ ...announced, effective: utc('2027-06-01') }] })],
      today,
      60,
      20,
    );
    expect(items).toEqual([]);
  });

  it('drops items beyond the horizon', () => {
    const items = needsAttention(
      [subject({ updates: [update('2027-06-01', breaking)] })],
      today,
      60,
      20,
    );
    expect(items).toEqual([]);
  });

  it('ranks breaking above action-required', () => {
    const items = needsAttention(
      [
        subject({
          updates: [update('2026-10-01', actionRequired, 'Act'), update('2026-09-20', breaking, 'Break')],
        }),
      ],
      today,
      60,
      20,
    );
    expect(items.map((item) => item.kind === 'update' && item.update.title)).toEqual([
      'Break',
      'Act',
    ]);
  });
});
