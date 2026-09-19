import type { LifecycleStage } from '@config';
import { phaseStageIds } from './schema';
import type { TimelineEntry } from './timeline';

/**
 * Rollout phases: the audience-by-audience arc a streamline travels.
 *
 * A product has one lifecycle. A rollout has several, one per audience — the
 * pilot team is generally available while everyone else is still proposed.
 * Phases record that, so a reader can find their own group rather than
 * guessing whether "rolling out" means them yet.
 *
 * Kept free of Astro so the emphasis rules are unit-tested directly.
 */

export interface Phase {
  name: string;
  /** Who gets it in this phase, in the author's own words. */
  audience: string;
  stage: LifecycleStage;
  /** The phase's own dates, in lifecycle order. Empty when it has none. */
  timeline: TimelineEntry[];
}

/**
 * How much weight a phase's row carries.
 *
 * `complete` — this audience has it, and the row is a record.
 * `active`   — the phase actually in motion, the one a reader should read.
 * `upcoming` — not started, or behind the active one. Present but quiet.
 */
export type PhaseEmphasis = 'complete' | 'active' | 'upcoming';

/**
 * The stage a phase is in once that audience is fully served — the last stage
 * a phase is allowed to be in, read from the lifecycle rather than named here.
 * Rename `generally-available` and this follows it.
 */
export const finalPhaseStageId: string | undefined = phaseStageIds[phaseStageIds.length - 1];

/**
 * Which row carries the weight, one entry per phase in the order given.
 *
 * The active phase is the furthest along that has not finished: the pilot
 * being done is history, and the phase nobody has started is a promise, but
 * the one in between is what a reader is trying to find. Ties go to the
 * earliest declared, which is the narrower audience — phases are written
 * narrow to wide, so the earlier of two phases at the same stage is the one
 * further through its own arc.
 */
export function phaseEmphasis(phases: Phase[]): PhaseEmphasis[] {
  const isComplete = phases.map(
    (phase) => finalPhaseStageId !== undefined && phase.stage.id === finalPhaseStageId,
  );

  let activeIndex = -1;
  let furthest = Number.NEGATIVE_INFINITY;

  phases.forEach((phase, index) => {
    if (isComplete[index]) return;
    // -1 for a stage the lifecycle no longer defines, which still beats
    // nothing: a single phase in a renamed stage is better read as active
    // than as silently upcoming.
    const position = phaseStageIds.indexOf(phase.stage.id);
    if (position > furthest) {
      furthest = position;
      activeIndex = index;
    }
  });

  return phases.map((_, index) => {
    if (isComplete[index]) return 'complete';
    return index === activeIndex ? 'active' : 'upcoming';
  });
}
