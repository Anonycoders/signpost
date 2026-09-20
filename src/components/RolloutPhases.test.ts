import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { describe, expect, it } from 'vitest';

import RolloutPhases from './RolloutPhases.astro';
import { getStage } from '@/lib/taxonomy';
import type { Phase } from '@/lib/phases';

/**
 * What a reader actually sees in the rollout tracker.
 *
 * The emphasis rule is unit-tested in `lib/phases.test.ts`; this checks that the
 * rule reaches the markup — that the row carrying the weight is the row marked
 * up as current, that a finished row is faded rather than hidden, and that the
 * lede answers "has it reached me" without anyone having to read the table.
 */

const phase = (
  name: string,
  audience: string,
  stageId: string,
  timeline: Phase['timeline'] = [],
): Phase => ({ name, audience, stage: getStage(stageId), timeline });

async function render(phases: Phase[]): Promise<string> {
  const container = await AstroContainer.create();
  return container.renderToString(RolloutPhases, { props: { phases } });
}

describe('RolloutPhases', () => {
  it('renders an empty tracker without failing', async () => {
    // The page does not ask for the section when there are no phases, but a
    // component that throws on an empty list is a trap for the next caller.
    const html = await render([]);

    expect(html).toContain('By audience');
    expect(html).not.toContain('aria-current');
  });

  it('renders a single phase, leading with its audience', async () => {
    const html = await render([phase('Phase 1', 'Pilot teams', 'rolling-out')]);

    expect(html).toContain('Pilot teams');
    expect(html).toContain('Phase 1');
    expect(html).toContain('Rolling out');
    expect(html).toContain('Currently reaching Pilot teams.');
    expect(html.match(/<li/g)).toHaveLength(1);
  });

  it('renders a phase’s own dates', async () => {
    const html = await render([
      phase('Phase 1', 'Pilot teams', 'rolling-out', [
        { stage: getStage('rolling-out'), date: new Date('2026-03-01') },
      ]),
    ]);

    expect(html).toContain('Mar 2026');
  });

  it('renders many phases, with the weight on the furthest unfinished one', async () => {
    const html = await render([
      phase('Phase 1', 'Pilot teams', 'generally-available'),
      phase('Phase 2', 'Product engineering', 'rolling-out'),
      phase('Phase 3', 'Everyone else', 'proposed'),
    ]);

    const items = html.split('<li').slice(1);
    expect(items).toHaveLength(3);

    // Complete is faded, active is tinted and marked current, upcoming is plain.
    expect(items[0]).toContain('opacity-55');
    expect(items[1]).toContain('aria-current="step"');
    expect(items[2]).not.toContain('aria-current');
    expect(items[2]).not.toContain('opacity-55');

    expect(html).toContain('Currently reaching Product engineering.');
  });

  it('does not claim to be reaching anyone before the rollout has started', async () => {
    const html = await render([
      phase('Phase 1', 'Platform engineers', 'proposed'),
      phase('Phase 2', 'Everyone else', 'proposed'),
    ]);

    expect(html).toContain('Next up: Platform engineers.');
    expect(html).not.toContain('Currently reaching');
  });

  it('says so when every phase has landed, rather than pointing at nothing', async () => {
    const html = await render([
      phase('Phase 1', 'Pilot teams', 'generally-available'),
      phase('Phase 2', 'Everyone else', 'generally-available'),
    ]);

    expect(html).toContain('All 2 phases have landed.');
    expect(html).not.toContain('aria-current');
  });

  it('keeps the stage readable in words on every row, not only as a colour', async () => {
    const html = await render([
      phase('Phase 1', 'Pilot teams', 'generally-available'),
      phase('Phase 2', 'Everyone else', 'proposed'),
    ]);

    expect(html).toContain('Generally available');
    expect(html).toContain('Proposed');
  });

  it('is a block inside the lifecycle card, not a section of its own', async () => {
    // The whole point of the nesting: the phase rows are the lifecycle told per
    // audience, so they belong under the page's Lifecycle h2 rather than beside
    // it. A section with its own h2 here puts the two back to being peers in
    // the document outline, whatever the borders happen to look like.
    const html = await render([phase('Phase 1', 'Pilot teams', 'rolling-out')]);

    expect(html).not.toContain('<section');
    expect(html).not.toContain('<h2');
    expect(html).toContain('<h3');
  });
});
