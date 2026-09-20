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
 * The stage a phase sits in before anything has happened for that audience.
 * Derived like the one above, so a renamed first stage follows.
 */
export const firstPhaseStageId: string | undefined = phaseStageIds[0];

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

/**
 * The one line above the tracker, for a reader who is not going to read the
 * table.
 *
 * It has to survive a rollout that has not begun. A streamline can declare its
 * waves while the whole thing is still a proposal, and saying "currently
 * reaching" about an audience nobody has shipped to yet is simply false — so a
 * phase still sitting in the first stage is announced as what comes next
 * instead of as what is happening.
 */
export function phaseSummary(phases: Phase[]): string {
  const emphasis = phaseEmphasis(phases);
  const activeIndex = emphasis.indexOf('active');

  if (activeIndex === -1) {
    const landed = emphasis.filter((weight) => weight === 'complete').length;
    if (landed === 0) return 'No phases recorded.';
    // "All 1 phase have landed" is what counting into a sentence gets you.
    return landed === 1 ? 'Every phase has landed.' : `All ${landed} phases have landed.`;
  }

  const { audience, stage } = phases[activeIndex]!;

  return stage.id === firstPhaseStageId
    ? `Next up: ${audience}.`
    : `Currently reaching ${audience}.`;
}
