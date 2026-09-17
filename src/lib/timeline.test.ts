import { describe, expect, it } from 'vitest';

import type { LifecycleStage } from '@config';
import { plannedTransitions, stageOn, type TimelineEntry } from './timeline';

const stage = (id: string): LifecycleStage => ({ id, label: id, description: '', tone: 'gray' });

const utc = (iso: string): Date => new Date(`${iso}T00:00:00.000Z`);

const entry = (id: string, iso: string): TimelineEntry => ({ stage: stage(id), date: utc(iso) });

describe('stageOn', () => {
  const timeline = [
    entry('proposed', '2026-01-15'),
    entry('in-development', '2026-03-02'),
    entry('rolling-out', '2026-09-01'),
  ];

  it('returns the stage that had been reached on that date', () => {
    expect(stageOn(timeline, utc('2026-05-01'))?.id).toBe('in-development');
  });

  it('includes the transition day itself', () => {
    expect(stageOn(timeline, utc('2026-03-02'))?.id).toBe('in-development');
  });

  it('returns the last stage for a date after every transition', () => {
    expect(stageOn(timeline, utc('2027-01-01'))?.id).toBe('rolling-out');
  });

  it('returns undefined for a date before the story starts', () => {
    expect(stageOn(timeline, utc('2025-12-31'))).toBeUndefined();
  });

  it('does not relabel history when a streamline moves on', () => {
    // The point of the function: an update written during development keeps
    // saying "in-development" even though the streamline is now rolling out.
    const duringDevelopment = utc('2026-04-10');
    expect(stageOn(timeline, duringDevelopment)?.id).toBe('in-development');
    expect(stageOn(timeline, utc('2026-09-10'))?.id).toBe('rolling-out');
  });

  it('prefers the later stage when two share a date', () => {
    const sameDay = [entry('proposed', '2026-01-15'), entry('in-development', '2026-01-15')];
    expect(stageOn(sameDay, utc('2026-02-01'))?.id).toBe('in-development');
  });

  it('is not fooled by a timeline given out of order', () => {
    const shuffled = [
      entry('rolling-out', '2026-09-01'),
      entry('proposed', '2026-01-15'),
      entry('in-development', '2026-03-02'),
    ];
    expect(stageOn(shuffled, utc('2026-05-01'))?.id).toBe('in-development');
  });

  it('handles an empty timeline', () => {
    expect(stageOn([], utc('2026-05-01'))).toBeUndefined();
  });
});

describe('plannedTransitions', () => {
  const timeline = [
    entry('proposed', '2026-01-15'),
    entry('rolling-out', '2026-09-01'),
    entry('generally-available', '2026-11-16'),
    entry('deprecated', '2027-02-01'),
  ];

  it('returns only future dates, soonest first', () => {
    const planned = plannedTransitions(timeline, utc('2026-09-17'));
    expect(planned.map((p) => p.stage.id)).toEqual(['generally-available', 'deprecated']);
  });

  it('treats today as already reached', () => {
    const planned = plannedTransitions(timeline, utc('2026-09-01'));
    expect(planned.map((p) => p.stage.id)).toEqual(['generally-available', 'deprecated']);
  });

  it('returns nothing when everything has happened', () => {
    expect(plannedTransitions(timeline, utc('2028-01-01'))).toEqual([]);
  });
});
