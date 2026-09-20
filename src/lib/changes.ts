import type { ImpactLevel, LifecycleStage } from '@config';
import { formatMonth } from './date';
import type { TimelineEntry } from './timeline';
import { landsOn } from './updates';

/**
 * The change feed behind /changes/.
 *
 * Two kinds of thing change under a reader: a team posts an update, and a
 * streamline crosses into a new stage on a planned date. Both belong in one
 * chronological list, because a reader asking "what lands on me next month"
 * does not care which of the two it was.
 *
 * Free of Astro so the merging and grouping are unit-tested.
 */

export interface ChangeSubject {
  id: string;
  title: string;
  href: string;
  team: { slug: string; name: string; href: string };
  category: { id: string };
  timeline: TimelineEntry[];
  updates: ChangeUpdate[];
}

export interface ChangeUpdate {
  /** When it was written. */
  date: Date;
  /** When it lands, if later than when it was written. */
  effective?: Date;
  title: string;
  body?: string;
  impact: ImpactLevel;
  stage: LifecycleStage;
}

export type ChangeItem =
  | { kind: 'update'; date: Date; streamline: ChangeSubject; update: ChangeUpdate }
  | { kind: 'transition'; date: Date; streamline: ChangeSubject; stage: LifecycleStage };

export interface MonthGroup {
  /** Sortable key, `YYYY-MM`. */
  key: string;
  label: string;
  items: ChangeItem[];
}

export interface ChangeFeed {
  /** Still to come, soonest first, grouped by month. */
  upcoming: MonthGroup[];
  /** Already happened, within the recent window, newest first. */
  recent: ChangeItem[];
}

const weightOf = (item: ChangeItem): number =>
  item.kind === 'update' ? item.update.impact.weight : 0;

const monthKey = (date: Date): string =>
  `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;

/** Every dated thing about one streamline, as feed items. */
function itemsFor(streamline: ChangeSubject): ChangeItem[] {
  return [
    ...streamline.updates.map(
      (update): ChangeItem => ({ kind: 'update', date: landsOn(update), streamline, update }),
    ),
    ...streamline.timeline.map(
      (entry): ChangeItem => ({
        kind: 'transition',
        date: entry.date,
        streamline,
        stage: entry.stage,
      }),
    ),
  ];
}

/**
 * Split every dated item into what is coming and what just happened.
 *
 * `today` is passed in rather than read from the clock so the result is
 * reproducible in tests and identical across a build.
 */
export function buildChangeFeed(
  streamlines: ChangeSubject[],
  today: Date,
  recentDays: number,
): ChangeFeed {
  const now = today.getTime();
  const floor = now - recentDays * 86_400_000;

  const all = streamlines.flatMap(itemsFor);

  const upcomingItems = all
    .filter((item) => item.date.getTime() > now)
    // Soonest first; within a day, the most consequential thing leads.
    .sort((a, b) => a.date.getTime() - b.date.getTime() || weightOf(b) - weightOf(a));

  const recent = all
    .filter((item) => item.date.getTime() <= now && item.date.getTime() >= floor)
    .sort((a, b) => b.date.getTime() - a.date.getTime() || weightOf(b) - weightOf(a));

  const byMonth = new Map<string, MonthGroup>();
  for (const item of upcomingItems) {
    const key = monthKey(item.date);
    let group = byMonth.get(key);
    if (!group) {
      group = { key, label: formatMonth(item.date), items: [] };
      byMonth.set(key, group);
    }
    group.items.push(item);
  }

  return {
    upcoming: [...byMonth.values()].sort((a, b) => a.key.localeCompare(b.key)),
    recent,
  };
}

/**
 * The items worth interrupting someone for: high-impact updates landing inside
 * the attention window. Shared by /changes/ and the home page strip so the two
 * can never disagree.
 *
 * Bounded at both ends. The horizon keeps next year's deprecation out of a
 * strip about what to do now; the floor drops changes that have already
 * landed and stayed landed, so a breaking change from last spring does not sit
 * on the home page forever demanding attention nobody can still give it.
 */
export function needsAttention(
  streamlines: ChangeSubject[],
  today: Date,
  windowDays: number,
  minWeight: number,
  recentDays: number,
): ChangeItem[] {
  const now = today.getTime();
  const horizon = now + windowDays * 86_400_000;
  const floor = now - recentDays * 86_400_000;

  return streamlines
    .flatMap((streamline) =>
      streamline.updates
        .filter((update) => update.impact.weight >= minWeight)
        .map((update): ChangeItem => ({ kind: 'update', date: landsOn(update), streamline, update })),
    )
    .filter((item) => item.date.getTime() <= horizon && item.date.getTime() >= floor)
    .sort((a, b) => weightOf(b) - weightOf(a) || b.date.getTime() - a.date.getTime());
}
