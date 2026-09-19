import { describe, expect, it } from 'vitest';

import type { LifecycleStage } from '@config';
import { finalPhaseStageId, phaseEmphasis, type Phase } from './phases';

/**
 * Which row of the rollout tracker carries the weight. The rule is only worth
 * anything if it survives the awkward shapes: every phase finished, none
 * finished, two at the same stage, a stage the lifecycle no longer defines.
 */

const stage = (id: string): LifecycleStage => ({ id, label: id, description: '', tone: 'gray' });

const phase = (name: string, stageId: string): Phase => ({
  name,
  audience: `${name} audience`,
  stage: stage(stageId),
  timeline: [],
});

describe('finalPhaseStageId', () => {
  it('is the last stage a phase may be in, from the configured lifecycle', () => {
    // Derived, not named: the shipped lifecycle ends its progression at
    // generally-available, with deprecated and retired excluded as
    // winding-down and terminal.
    expect(finalPhaseStageId).toBe('generally-available');
  });
});

describe('phaseEmphasis', () => {
  it('returns nothing for no phases', () => {
    expect(phaseEmphasis([])).toEqual([]);
  });

  it('marks a lone unfinished phase active', () => {
    expect(phaseEmphasis([phase('Phase 1', 'proposed')])).toEqual(['active']);
  });

  it('marks a lone finished phase complete, with nothing active', () => {
    expect(phaseEmphasis([phase('Phase 1', 'generally-available')])).toEqual(['complete']);
  });

  it('gives the weight to the furthest phase that has not finished', () => {
    expect(
      phaseEmphasis([
        phase('Phase 1', 'generally-available'),
        phase('Phase 2', 'rolling-out'),
        phase('Phase 3', 'proposed'),
      ]),
    ).toEqual(['complete', 'active', 'upcoming']);
  });

  it('does not give the weight to the last phase just because it is last', () => {
    // Phase 3 is furthest down the page; phase 2 is furthest through the
    // lifecycle, and it is the one a reader is looking for.
    expect(
      phaseEmphasis([
        phase('Phase 1', 'generally-available'),
        phase('Phase 2', 'rolling-out'),
        phase('Phase 3', 'in-development'),
      ]),
    ).toEqual(['complete', 'active', 'upcoming']);
  });

  it('breaks a tie towards the earlier phase, which is the narrower audience', () => {
    expect(
      phaseEmphasis([
        phase('Phase 1', 'rolling-out'),
        phase('Phase 2', 'rolling-out'),
        phase('Phase 3', 'proposed'),
      ]),
    ).toEqual(['active', 'upcoming', 'upcoming']);
  });

  it('marks every phase complete when the rollout is finished', () => {
    expect(
      phaseEmphasis([
        phase('Phase 1', 'generally-available'),
        phase('Phase 2', 'generally-available'),
      ]),
    ).toEqual(['complete', 'complete']);
  });

  it('keeps a phase in an unconfigured stage visible rather than silently quiet', () => {
    // Reachable only if a fork renames a stage without updating its content.
    // Better to point at the row than to leave every row upcoming.
    expect(phaseEmphasis([phase('Phase 1', 'pilot')])).toEqual(['active']);
  });

  it('prefers a configured stage over an unconfigured one for the weight', () => {
    expect(phaseEmphasis([phase('Phase 1', 'pilot'), phase('Phase 2', 'proposed')])).toEqual([
      'upcoming',
      'active',
    ]);
  });
});
