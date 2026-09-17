import { describe, expect, it } from 'vitest';

import type { LifecycleStage } from '@config';
import { buildLane, buildWindow } from './roadmap';
import type { TimelineEntry } from './timeline';

const stage = (id: string): LifecycleStage => ({ id, label: id, description: '', tone: 'gray' });
const utc = (iso: string): Date => new Date(`${iso}T00:00:00.000Z`);
const entry = (id: string, iso: string): TimelineEntry => ({ stage: stage(id), date: utc(iso) });

/** Percentages carry float noise; compare at a sane precision. */
const round = (value: number): number => Math.round(value * 100) / 100;

describe('buildWindow', () => {
  const today = utc('2026-09-17'); // Q3 2026

  it('spans past + current + future quarters', () => {
    const window = buildWindow(today, 1, 4);
    expect(window.quarters).toHaveLength(6);
    expect(window.quarters.map((q) => q.label)).toEqual([
      'Q2 2026',
      'Q3 2026',
      'Q4 2026',
      'Q1 2027',
      'Q2 2027',
      'Q3 2027',
    ]);
  });

  it('crosses the year boundary without special casing', () => {
    const window = buildWindow(utc('2026-11-20'), 2, 2);
    expect(window.quarters.map((q) => q.label)).toEqual([
      'Q2 2026',
      'Q3 2026',
      'Q4 2026',
      'Q1 2027',
      'Q2 2027',
    ]);
  });

  it('starts at the first day of the earliest quarter and ends at the next quarter start', () => {
    const window = buildWindow(today, 1, 4);
    expect(window.start.toISOString()).toBe('2026-04-01T00:00:00.000Z');
    expect(window.end.toISOString()).toBe('2027-10-01T00:00:00.000Z');
  });

  it('marks the quarter containing today', () => {
    const window = buildWindow(today, 1, 4);
    expect(window.quarters.filter((q) => q.isCurrent).map((q) => q.label)).toEqual(['Q3 2026']);
  });

  it('places the today marker inside the current quarter', () => {
    const window = buildWindow(today, 1, 4);
    const current = window.quarters.find((q) => q.isCurrent)!;
    expect(window.todayPct).not.toBeNull();
    expect(window.todayPct!).toBeGreaterThan(current.startPct);
    expect(window.todayPct!).toBeLessThan(current.startPct + current.widthPct);
  });

  it('covers the full width with contiguous quarters', () => {
    const window = buildWindow(today, 1, 4);
    const first = window.quarters[0]!;
    const last = window.quarters[window.quarters.length - 1]!;
    expect(round(first.startPct)).toBe(0);
    expect(round(last.startPct + last.widthPct)).toBe(100);

    for (const [index, quarter] of window.quarters.slice(1).entries()) {
      const previous = window.quarters[index]!;
      expect(round(quarter.startPct)).toBe(round(previous.startPct + previous.widthPct));
    }
  });

  it('supports a window with no past quarters', () => {
    const window = buildWindow(today, 0, 1);
    expect(window.quarters.map((q) => q.label)).toEqual(['Q3 2026', 'Q4 2026']);
  });
});

describe('buildLane', () => {
  const today = utc('2026-09-17');
  const window = buildWindow(today, 1, 4); // 2026-04-01 .. 2027-10-01

  it('runs each stage until the next one', () => {
    const lane = buildLane(
      { id: 'a', timeline: [entry('rolling-out', '2026-07-01'), entry('generally-available', '2026-10-01')] },
      window,
      today,
    );

    const [first] = lane.segments;
    expect(first!.stage.id).toBe('rolling-out');
    expect(first!.start.toISOString()).toBe('2026-07-01T00:00:00.000Z');
    expect(first!.end.toISOString()).toBe('2026-10-01T00:00:00.000Z');
  });

  it('runs the final stage to the right edge, because it is still in it', () => {
    const lane = buildLane({ id: 'a', timeline: [entry('generally-available', '2026-07-01')] }, window, today);
    const [only] = lane.segments;
    expect(only!.end.toISOString()).toBe(window.end.toISOString());
    expect(round(only!.startPct + only!.widthPct)).toBe(100);
    expect(only!.continues).toBe(false);
  });

  it('clips a stage that began before the window opened', () => {
    const lane = buildLane(
      { id: 'a', timeline: [entry('proposed', '2020-01-01'), entry('generally-available', '2026-07-01')] },
      window,
      today,
    );
    const [first] = lane.segments;
    expect(first!.start.toISOString()).toBe(window.start.toISOString());
    expect(round(first!.startPct)).toBe(0);
  });

  it('keeps the true start date on a clipped segment', () => {
    // The drawn bar starts at the window edge; the text equivalent must not
    // claim the streamline was proposed on that day.
    const lane = buildLane(
      { id: 'a', timeline: [entry('deprecated', '2026-02-16'), entry('retired', '2027-03-31')] },
      window,
      today,
    );
    const [first] = lane.segments;
    expect(first!.start.toISOString()).toBe('2026-04-01T00:00:00.000Z');
    expect(first!.rawStart.toISOString()).toBe('2026-02-16T00:00:00.000Z');
  });

  it('leaves rawStart equal to start when nothing was clipped', () => {
    const lane = buildLane({ id: 'a', timeline: [entry('rolling-out', '2026-07-01')] }, window, today);
    const [only] = lane.segments;
    expect(only!.rawStart.toISOString()).toBe(only!.start.toISOString());
  });

  it('drops a stage that ended before the window opened', () => {
    const lane = buildLane(
      { id: 'a', timeline: [entry('proposed', '2019-01-01'), entry('in-development', '2020-01-01')] },
      window,
      today,
    );
    // Both are ancient, but the last stage runs to the window end, so only the
    // first (which closed in 2020) disappears.
    expect(lane.segments.map((s) => s.stage.id)).toEqual(['in-development']);
  });

  it('marks stages in the future as planned and past ones as not', () => {
    const lane = buildLane(
      { id: 'a', timeline: [entry('rolling-out', '2026-07-01'), entry('generally-available', '2026-11-16')] },
      window,
      today,
    );
    expect(lane.segments.map((s) => s.planned)).toEqual([false, true]);
  });

  it('emits a diamond for each future transition inside the window', () => {
    const lane = buildLane(
      {
        id: 'a',
        timeline: [
          entry('rolling-out', '2026-07-01'),
          entry('generally-available', '2026-11-16'),
          entry('deprecated', '2027-06-01'),
        ],
      },
      window,
      today,
    );
    expect(lane.markers.map((m) => m.stage.id)).toEqual(['generally-available', 'deprecated']);
    for (const marker of lane.markers) {
      expect(marker.pct).toBeGreaterThan(0);
      expect(marker.pct).toBeLessThanOrEqual(100);
    }
  });

  it('does not emit diamonds for transitions beyond the window', () => {
    const lane = buildLane(
      { id: 'a', timeline: [entry('rolling-out', '2026-07-01'), entry('retired', '2030-01-01')] },
      window,
      today,
    );
    expect(lane.markers).toEqual([]);
  });

  it('reports no content for a streamline with no dates in range', () => {
    const lane = buildLane({ id: 'a', timeline: [] }, window, today);
    expect(lane.hasContent).toBe(false);
    expect(lane.segments).toEqual([]);
  });

  it('places a bar in the same span the quarter grid gives that date', () => {
    // The acceptance criterion: geometry must agree with the timeline data.
    const lane = buildLane({ id: 'a', timeline: [entry('rolling-out', '2026-10-01')] }, window, today);
    const q4 = window.quarters.find((q) => q.label === 'Q4 2026')!;
    expect(round(lane.segments[0]!.startPct)).toBe(round(q4.startPct));
  });
});
