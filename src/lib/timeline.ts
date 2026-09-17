import type { LifecycleStage } from '@config';

/**
 * Timeline reasoning, kept free of Astro so it can be unit-tested directly.
 *
 * A streamline's `timeline` is a sparse map of stage to date. Everything the
 * site says about *when* something happened — which stage an update belongs
 * to, where a bar starts on the roadmap — is derived from it here.
 */

export interface TimelineEntry {
  stage: LifecycleStage;
  date: Date;
}

/**
 * The stage a streamline was in on a given date.
 *
 * This is what dates an update correctly. An update written during
 * development stays labelled "In development" after the streamline moves on,
 * instead of being retroactively relabelled with today's stage — which is
 * what happens if you simply fall back to the current status.
 *
 * Returns undefined when the date precedes every dated stage; the caller
 * decides what an update from before the story started should say.
 */
export function stageOn(timeline: TimelineEntry[], date: Date): LifecycleStage | undefined {
  const at = date.getTime();
  let reached: TimelineEntry | undefined;

  for (const entry of timeline) {
    if (entry.date.getTime() > at) continue;
    // `>=` so that when two stages share a date, the later one wins — a
    // streamline that was proposed and started on the same day is in
    // development, not proposed.
    if (!reached || entry.date.getTime() >= reached.date.getTime()) reached = entry;
  }

  return reached?.stage;
}

/** Dated stages still ahead of `today`, in the order they will happen. */
export function plannedTransitions(timeline: TimelineEntry[], today: Date): TimelineEntry[] {
  return timeline
    .filter((entry) => entry.date.getTime() > today.getTime())
    .sort((a, b) => a.date.getTime() - b.date.getTime());
}
