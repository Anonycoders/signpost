import type { LifecycleStage } from '@config';
import { quarterEnd, quarterLabel, quarterOf, quarterStart } from './date';
import type { TimelineEntry } from './timeline';

/**
 * Geometry for the roadmap timeline.
 *
 * Every position is a percentage of the visible window, so the page needs no
 * measurement and no JavaScript: the server computes the bars and the browser
 * just draws them. Kept free of Astro so the arithmetic is unit-tested.
 */

export interface Quarter {
  year: number;
  quarter: number;
  label: string;
  start: Date;
  /** Exclusive: the first instant of the next quarter. */
  end: Date;
  startPct: number;
  widthPct: number;
  isCurrent: boolean;
}

export interface RoadmapWindow {
  start: Date;
  /** Exclusive. */
  end: Date;
  quarters: Quarter[];
  /** Percentage position of today, or null when today falls outside. */
  todayPct: number | null;
}

/** What a lane needs to know about a streamline. Structural, so a full
 * `Streamline` satisfies it and a test fixture can be three fields. */
export interface RoadmapSubject {
  id: string;
  timeline: TimelineEntry[];
}

export interface Segment {
  stage: LifecycleStage;
  start: Date;
  end: Date;
  startPct: number;
  widthPct: number;
  /** True when this stage has not been reached yet. */
  planned: boolean;
  /** True when the segment runs past the right edge of the window. */
  continues: boolean;
}

export interface Marker {
  stage: LifecycleStage;
  date: Date;
  pct: number;
}

export interface Lane {
  segments: Segment[];
  /** Future transitions inside the window, drawn as diamonds. */
  markers: Marker[];
  /** False when the streamline has no dates inside the window at all. */
  hasContent: boolean;
}

/**
 * The quarter grid, counted outwards from the quarter containing `today`.
 * `past` and `future` come from `roadmapQuarters` in site.config.ts.
 */
export function buildWindow(today: Date, past: number, future: number): RoadmapWindow {
  const current = quarterOf(today);

  // Quarter arithmetic in absolute quarter-numbers, so year boundaries need no
  // special casing: Q4 2026 + 1 is simply the next index.
  const currentIndex = current.year * 4 + (current.quarter - 1);
  const firstIndex = currentIndex - Math.max(0, past);
  const count = Math.max(0, past) + 1 + Math.max(0, future);

  const bounds = Array.from({ length: count }, (_, offset) => {
    const index = firstIndex + offset;
    const year = Math.floor(index / 4);
    const quarter = (index % 4) + 1;
    return { year, quarter, start: quarterStart(year, quarter), end: quarterEnd(year, quarter) };
  });

  const start = bounds[0]!.start;
  const end = bounds[bounds.length - 1]!.end;
  const span = end.getTime() - start.getTime();

  const pct = (date: Date) => ((date.getTime() - start.getTime()) / span) * 100;

  const quarters: Quarter[] = bounds.map((bound) => ({
    year: bound.year,
    quarter: bound.quarter,
    label: quarterLabel(bound.year, bound.quarter),
    start: bound.start,
    end: bound.end,
    startPct: pct(bound.start),
    widthPct: pct(bound.end) - pct(bound.start),
    isCurrent: bound.year === current.year && bound.quarter === current.quarter,
  }));

  const todayInside = today.getTime() >= start.getTime() && today.getTime() <= end.getTime();

  return { start, end, quarters, todayPct: todayInside ? pct(today) : null };
}

/**
 * One streamline's bar.
 *
 * Each dated stage runs until the next dated stage; the final stage runs to
 * the right edge, because a streamline that reached a stage is still in it.
 * Segments outside the window are dropped and partial ones are clipped, so a
 * ten-year-old streamline shows only the part that fits.
 */
export function buildLane(subject: RoadmapSubject, window: RoadmapWindow, today: Date): Lane {
  const span = window.end.getTime() - window.start.getTime();
  const pct = (date: Date) => ((date.getTime() - window.start.getTime()) / span) * 100;

  const ordered = [...subject.timeline].sort((a, b) => a.date.getTime() - b.date.getTime());
  const segments: Segment[] = [];

  for (const [index, entry] of ordered.entries()) {
    const next = ordered[index + 1];
    const rawStart = entry.date;
    const rawEnd = next ? next.date : window.end;

    // Skip anything that ends before the window opens or starts after it shuts.
    if (rawEnd.getTime() <= window.start.getTime()) continue;
    if (rawStart.getTime() >= window.end.getTime()) continue;

    const clippedStart = rawStart.getTime() < window.start.getTime() ? window.start : rawStart;
    const clippedEnd = rawEnd.getTime() > window.end.getTime() ? window.end : rawEnd;

    segments.push({
      stage: entry.stage,
      start: clippedStart,
      end: clippedEnd,
      startPct: pct(clippedStart),
      widthPct: pct(clippedEnd) - pct(clippedStart),
      planned: rawStart.getTime() > today.getTime(),
      continues: rawEnd.getTime() > window.end.getTime(),
    });
  }

  const markers: Marker[] = ordered
    .filter(
      (entry) =>
        entry.date.getTime() > today.getTime() &&
        entry.date.getTime() >= window.start.getTime() &&
        entry.date.getTime() <= window.end.getTime(),
    )
    .map((entry) => ({ stage: entry.stage, date: entry.date, pct: pct(entry.date) }));

  return { segments, markers, hasContent: segments.length > 0 };
}
