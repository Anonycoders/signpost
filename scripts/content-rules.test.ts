import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

import { describe, expect, it } from 'vitest';

import { validateContent } from './content-rules';

/**
 * These tests are the contract a contributor relies on: when they get a file
 * wrong, CI has to tell them which file, which field, and what to do about it.
 * Each case therefore asserts on the wording of the message, not just that
 * something failed.
 */

function fixture(files: Record<string, string>) {
  const root = mkdtempSync(join(tmpdir(), 'signpost-test-'));

  for (const [path, content] of Object.entries(files)) {
    const full = join(root, path);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, content);
  }

  return validateContent(join(root, 'content'), root);
}

const DEVOPS_TEAM = `
name: DevOps
mission: Runs the clusters and the deployment tooling.
channel: "#devops"
`;

/** A streamline with nothing wrong with it, for tests to break deliberately. */
function streamline(overrides: Partial<Record<string, string>> = {}) {
  const {
    team = 'devops',
    status = 'rolling-out',
    timeline = `
  proposed: 2026-01-15
  in-development: 2026-03-02
  rolling-out: 2026-09-01`,
    extra = '',
    updates = `
  - date: 2026-09-10
    impact: info
    title: Rollout has started`,
  } = overrides;

  return `---
title: Kubernetes upgrade
team: ${team}
category: infrastructure
status: ${status}
summary: Cluster-wide upgrade that affects workloads on removed beta APIs.
owners:
  - name: Jana Okafor
    github: janaokafor
timeline:${timeline}${extra}
updates:${updates}
---

Body text.
`;
}

const messagesOf = (problems: Array<{ message: string }>) =>
  problems.map((problem) => problem.message).join('\n');

describe('valid content', () => {
  it('accepts a well-formed team and streamline', () => {
    const result = fixture({
      'content/teams/devops.yaml': DEVOPS_TEAM,
      'content/streamlines/devops/kubernetes-upgrade.md': streamline(),
    });

    expect(result.errors).toEqual([]);
    expect(result.counts).toEqual({ teams: 1, streamlines: 1 });
  });

  it('allows a streamline to skip lifecycle stages', () => {
    const result = fixture({
      'content/teams/devops.yaml': DEVOPS_TEAM,
      'content/streamlines/devops/kubernetes-upgrade.md': streamline({
        status: 'generally-available',
        timeline: `
  proposed: 2026-01-15
  generally-available: 2026-09-01`,
      }),
    });

    expect(result.errors).toEqual([]);
  });
});

describe('team references', () => {
  it('rejects a streamline whose team does not exist, and lists the ones that do', () => {
    const result = fixture({
      'content/teams/devops.yaml': DEVOPS_TEAM,
      'content/streamlines/platform/kubernetes-upgrade.md': streamline({ team: 'platform' }),
    });

    expect(messagesOf(result.errors)).toContain('There is no team called "platform"');
    expect(messagesOf(result.errors)).toContain('devops');
  });

  it('rejects a streamline filed under a different team than it claims', () => {
    const result = fixture({
      'content/teams/devops.yaml': DEVOPS_TEAM,
      'content/teams/ai-platform.yaml': 'name: AI Platform\nmission: Shared model access.\n',
      'content/streamlines/devops/kubernetes-upgrade.md': streamline({ team: 'ai-platform' }),
    });

    const problem = result.errors.find((error) => error.field === 'team');
    expect(problem?.message).toContain('team must be "devops"');
    expect(problem?.file).toBe('content/streamlines/devops/kubernetes-upgrade.md');
  });
});

describe('timeline coherence', () => {
  it('rejects stages dated out of lifecycle order, naming both stages', () => {
    const result = fixture({
      'content/teams/devops.yaml': DEVOPS_TEAM,
      'content/streamlines/devops/kubernetes-upgrade.md': streamline({
        timeline: `
  proposed: 2026-05-01
  in-development: 2026-03-02
  rolling-out: 2026-09-01`,
      }),
    });

    const message = messagesOf(result.errors);
    expect(message).toContain('In development');
    expect(message).toContain('Proposed');
    expect(message).toContain('comes later in the lifecycle');
  });

  it('requires a date for the stage the streamline is currently in', () => {
    const result = fixture({
      'content/teams/devops.yaml': DEVOPS_TEAM,
      'content/streamlines/devops/kubernetes-upgrade.md': streamline({
        status: 'rolling-out',
        timeline: `
  proposed: 2026-01-15
  in-development: 2026-03-02`,
      }),
    });

    expect(messagesOf(result.errors)).toContain('the timeline has no rolling-out date');
  });

  it('rejects an unknown stage name in the timeline', () => {
    const result = fixture({
      'content/teams/devops.yaml': DEVOPS_TEAM,
      'content/streamlines/devops/kubernetes-upgrade.md': streamline({
        timeline: `
  proposed: 2026-01-15
  rolling-out: 2026-09-01
  launched: 2026-10-01`,
      }),
    });

    expect(messagesOf(result.errors)).toContain('launched');
  });

  it('rejects a date that is not a real day', () => {
    const result = fixture({
      'content/teams/devops.yaml': DEVOPS_TEAM,
      'content/streamlines/devops/kubernetes-upgrade.md': streamline({
        timeline: `
  proposed: "2026-02-30"
  rolling-out: 2026-09-01`,
      }),
    });

    expect(messagesOf(result.errors)).toContain('2026-02-30');
    expect(messagesOf(result.errors)).toContain('YYYY-MM-DD');
  });
});

describe('deprecation safety', () => {
  it('refuses to let a deprecated streamline omit its retirement date', () => {
    const result = fixture({
      'content/teams/devops.yaml': DEVOPS_TEAM,
      'content/streamlines/devops/jenkins.md': streamline({
        status: 'deprecated',
        timeline: `
  generally-available: 2021-04-05
  deprecated: 2026-02-16`,
      }),
    });

    expect(messagesOf(result.errors)).toContain('must say when it will be retired');
  });

  it('accepts a deprecated streamline that states its retirement date', () => {
    const result = fixture({
      'content/teams/devops.yaml': DEVOPS_TEAM,
      'content/streamlines/devops/jenkins.md': streamline({
        status: 'deprecated',
        timeline: `
  generally-available: 2021-04-05
  deprecated: 2026-02-16
  retired: 2027-03-31`,
      }),
    });

    expect(result.errors).toEqual([]);
  });
});

describe('cross-references', () => {
  it('rejects a supersedes pointing at a streamline that does not exist', () => {
    const result = fixture({
      'content/teams/devops.yaml': DEVOPS_TEAM,
      'content/streamlines/devops/kubernetes-upgrade.md': streamline({
        extra: '\nsupersedes: devops/does-not-exist',
      }),
    });

    expect(messagesOf(result.errors)).toContain(
      'content/streamlines/devops/does-not-exist.md',
    );
  });

  it('resolves a supersedes that does exist', () => {
    const result = fixture({
      'content/teams/devops.yaml': DEVOPS_TEAM,
      'content/streamlines/devops/jenkins.md': streamline({
        status: 'deprecated',
        timeline: `
  generally-available: 2021-04-05
  deprecated: 2026-02-16
  retired: 2027-03-31`,
      }),
      'content/streamlines/devops/actions.md': streamline({
        extra: '\nsupersedes: devops/jenkins',
      }),
    });

    expect(result.errors).toEqual([]);
  });
});

describe('field-level rules', () => {
  it('requires at least one owner', () => {
    const result = fixture({
      'content/teams/devops.yaml': DEVOPS_TEAM,
      'content/streamlines/devops/orphan.md': `---
title: Orphaned work
team: devops
category: infrastructure
status: proposed
summary: Something nobody has put their name against.
owners: []
timeline:
  proposed: 2026-01-15
updates: []
---
`,
    });

    expect(messagesOf(result.errors)).toContain('at least one owner');
  });

  it('rejects a summary too long to fit on a card', () => {
    const result = fixture({
      'content/teams/devops.yaml': DEVOPS_TEAM,
      'content/streamlines/devops/wordy.md': streamline().replace(
        'summary: Cluster-wide upgrade that affects workloads on removed beta APIs.',
        `summary: ${'x'.repeat(240)}`,
      ),
    });

    expect(messagesOf(result.errors)).toContain('220 characters');
  });

  it('reports the field path for a problem inside an update', () => {
    const result = fixture({
      'content/teams/devops.yaml': DEVOPS_TEAM,
      'content/streamlines/devops/kubernetes-upgrade.md': streamline({
        updates: `
  - date: 2026-09-10
    impact: catastrophic
    title: Rollout has started`,
      }),
    });

    const problem = result.errors.find((error) => error.field === 'updates[0].impact');
    expect(problem?.message).toContain('breaking, action-required, info');
  });

  it('accepts an effective date after the posting date', () => {
    const result = fixture({
      'content/teams/devops.yaml': DEVOPS_TEAM,
      'content/streamlines/devops/kubernetes-upgrade.md': streamline({
        updates: `
  - date: 2026-09-10
    effective: 2026-10-01
    impact: breaking
    title: Ingress v1beta1 is removed on 1 October`,
      }),
    });

    expect(result.errors).toEqual([]);
  });

  it('rejects an effective date that is not after the posting date', () => {
    const result = fixture({
      'content/teams/devops.yaml': DEVOPS_TEAM,
      'content/streamlines/devops/kubernetes-upgrade.md': streamline({
        updates: `
  - date: 2026-09-10
    effective: 2026-08-01
    impact: breaking
    title: Ingress v1beta1 is removed`,
      }),
    });

    const problem = result.errors.find((error) => error.field === 'updates[0].effective');
    expect(problem?.message).toContain('is not after date');
    expect(problem?.message).toContain('remove it');
  });

  it('rejects an effective date equal to the posting date', () => {
    const result = fixture({
      'content/teams/devops.yaml': DEVOPS_TEAM,
      'content/streamlines/devops/kubernetes-upgrade.md': streamline({
        updates: `
  - date: 2026-09-10
    effective: 2026-09-10
    impact: info
    title: Rollout has started`,
      }),
    });

    expect(result.errors.some((error) => error.field === 'updates[0].effective')).toBe(true);
  });

  it('rejects frontmatter that is not valid YAML', () => {
    const result = fixture({
      'content/teams/devops.yaml': DEVOPS_TEAM,
      'content/streamlines/devops/broken.md': '---\ntitle: [unclosed\n---\n',
    });

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.file).toBe('content/streamlines/devops/broken.md');
  });
});

describe('warnings', () => {
  it('flags an active streamline that has gone quiet, without failing the build', () => {
    const result = fixture({
      'content/teams/devops.yaml': DEVOPS_TEAM,
      'content/streamlines/devops/forgotten.md': streamline({
        updates: `
  - date: 2020-01-06
    impact: info
    title: Work started`,
      }),
    });

    expect(result.errors).toEqual([]);
    expect(messagesOf(result.warnings)).toContain('still marked "Rolling out"');
  });

  it('does not flag a retired streamline as stale', () => {
    const result = fixture({
      'content/teams/devops.yaml': DEVOPS_TEAM,
      'content/streamlines/devops/old-tool.md': streamline({
        status: 'retired',
        timeline: `
  generally-available: 2019-06-01
  deprecated: 2019-11-03
  retired: 2020-06-30`,
        updates: `
  - date: 2020-06-30
    impact: info
    title: Switched off`,
      }),
    });

    expect(result.warnings).toEqual([]);
  });
});

describe('rollout phases', () => {
  /** Frontmatter for a `phases:` block, indented to sit under the key. */
  const phases = (yaml: string) => `\nphases:${yaml}`;

  const PILOT_THEN_EVERYONE = phases(`
  - name: Phase 1
    audience: Pilot teams
    status: generally-available
    timeline:
      rolling-out: 2026-02-01
      generally-available: 2026-04-01
  - name: Phase 2
    audience: Everyone else
    status: rolling-out
    timeline:
      rolling-out: 2026-09-01`);

  it('accepts a streamline with phases', () => {
    const result = fixture({
      'content/teams/devops.yaml': DEVOPS_TEAM,
      'content/streamlines/devops/kubernetes-upgrade.md': streamline({
        extra: PILOT_THEN_EVERYONE,
      }),
    });

    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it('accepts a phase with no timeline of its own', () => {
    const result = fixture({
      'content/teams/devops.yaml': DEVOPS_TEAM,
      'content/streamlines/devops/kubernetes-upgrade.md': streamline({
        extra: phases(`
  - name: Phase 1
    audience: Pilot teams
    status: proposed`),
      }),
    });

    expect(result.errors).toEqual([]);
  });

  it('accepts overlapping phases, which are how rollouts actually run', () => {
    // Deliberately no cross-phase ordering rule: a later phase may start
    // before an earlier one finishes, and may even be further along.
    const result = fixture({
      'content/teams/devops.yaml': DEVOPS_TEAM,
      'content/streamlines/devops/kubernetes-upgrade.md': streamline({
        extra: phases(`
  - name: Phase 1
    audience: Pilot teams
    status: rolling-out
    timeline:
      rolling-out: 2026-06-01
  - name: Phase 2
    audience: Everyone else
    status: rolling-out
    timeline:
      rolling-out: 2026-05-01`),
      }),
    });

    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it('rejects two phases with the same name', () => {
    const result = fixture({
      'content/teams/devops.yaml': DEVOPS_TEAM,
      'content/streamlines/devops/kubernetes-upgrade.md': streamline({
        extra: phases(`
  - name: Phase 1
    audience: Pilot teams
    status: proposed
  - name: phase 1
    audience: Everyone else
    status: proposed`),
      }),
    });

    expect(messagesOf(result.errors)).toContain(
      'Two phases are both called "phase 1". Phase names have to be unique within a streamline so a reader can tell which wave they are in.',
    );
    expect(result.errors[0]?.field).toBe('phases[1].name');
  });

  it('rejects a phase with no audience', () => {
    const result = fixture({
      'content/teams/devops.yaml': DEVOPS_TEAM,
      'content/streamlines/devops/kubernetes-upgrade.md': streamline({
        extra: phases(`
  - name: Phase 1
    status: proposed`),
      }),
    });

    expect(messagesOf(result.errors)).toContain(
      'A phase needs an audience — say who gets it in this phase, for example "Pilot teams" or "Everyone".',
    );
  });

  it('rejects a phase whose audience is blank', () => {
    const result = fixture({
      'content/teams/devops.yaml': DEVOPS_TEAM,
      'content/streamlines/devops/kubernetes-upgrade.md': streamline({
        extra: phases(`
  - name: Phase 1
    audience: ""
    status: proposed`),
      }),
    });

    expect(messagesOf(result.errors)).toContain(
      'A phase needs an audience — say who gets it in this phase, for example "Pilot teams" or "Everyone".',
    );
    expect(result.errors[0]?.field).toBe('phases[0].audience');
  });

  it('rejects a phase with no name', () => {
    const result = fixture({
      'content/teams/devops.yaml': DEVOPS_TEAM,
      'content/streamlines/devops/kubernetes-upgrade.md': streamline({
        extra: phases(`
  - audience: Pilot teams
    status: proposed`),
      }),
    });

    expect(messagesOf(result.errors)).toContain('A phase needs a name.');
  });

  it('rejects a winding-down stage as a phase status', () => {
    // "deprecated" is a perfectly good streamline status and a meaningless
    // phase status: the audience is not deprecated, the product is.
    const result = fixture({
      'content/teams/devops.yaml': DEVOPS_TEAM,
      'content/streamlines/devops/kubernetes-upgrade.md': streamline({
        extra: phases(`
  - name: Phase 1
    audience: Pilot teams
    status: deprecated`),
      }),
    });

    expect(messagesOf(result.errors)).toContain(
      'A phase moves through the rollout, so its status cannot be a winding-down or terminal stage. Must be one of: proposed, in-development, rolling-out, generally-available.',
    );
  });

  it('rejects a terminal stage as a phase status', () => {
    const result = fixture({
      'content/teams/devops.yaml': DEVOPS_TEAM,
      'content/streamlines/devops/kubernetes-upgrade.md': streamline({
        extra: phases(`
  - name: Phase 1
    audience: Pilot teams
    status: retired`),
      }),
    });

    expect(messagesOf(result.errors)).toContain(
      'A phase moves through the rollout, so its status cannot be a winding-down or terminal stage. Must be one of: proposed, in-development, rolling-out, generally-available.',
    );
  });

  it('rejects a phase timeline that runs backwards', () => {
    const result = fixture({
      'content/teams/devops.yaml': DEVOPS_TEAM,
      'content/streamlines/devops/kubernetes-upgrade.md': streamline({
        extra: phases(`
  - name: Phase 1
    audience: Pilot teams
    status: rolling-out
    timeline:
      in-development: 2026-06-01
      rolling-out: 2026-03-01`),
      }),
    });

    expect(messagesOf(result.errors)).toContain(
      'In "Phase 1", Rolling out (2026-03-01) is dated before In development (2026-06-01), but it comes later in the lifecycle. Check the dates.',
    );
    expect(result.errors[0]?.field).toBe('phases[0].timeline');
  });

  it('rejects an unknown stage in a phase timeline', () => {
    const result = fixture({
      'content/teams/devops.yaml': DEVOPS_TEAM,
      'content/streamlines/devops/kubernetes-upgrade.md': streamline({
        extra: phases(`
  - name: Phase 1
    audience: Pilot teams
    status: proposed
    timeline:
      shipped: 2026-06-01`),
      }),
    });

    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('warns, without blocking, when a phase claims a stage its own date has not reached', () => {
    const result = fixture({
      'content/teams/devops.yaml': DEVOPS_TEAM,
      'content/streamlines/devops/kubernetes-upgrade.md': streamline({
        extra: phases(`
  - name: Phase 1
    audience: Pilot teams
    status: generally-available
    timeline:
      generally-available: 2099-01-01`),
      }),
    });

    expect(result.errors).toEqual([]);
    expect(messagesOf(result.warnings)).toContain(
      '"Phase 1" is marked Generally available, but its Generally available date is 2099-01-01, which has not happened yet. Either the status is early or the date is.',
    );
    expect(result.warnings[0]?.field).toBe('phases[0].status');
  });

  it('warns when a phase has already passed the stage it claims', () => {
    const result = fixture({
      'content/teams/devops.yaml': DEVOPS_TEAM,
      'content/streamlines/devops/kubernetes-upgrade.md': streamline({
        extra: phases(`
  - name: Phase 1
    audience: Pilot teams
    status: rolling-out
    timeline:
      rolling-out: 2000-01-01
      generally-available: 2000-02-01`),
      }),
    });

    expect(result.errors).toEqual([]);
    expect(messagesOf(result.warnings)).toContain(
      '"Phase 1" is marked Rolling out, but it reached Generally available on 2000-02-01. Move the status on, or correct the date.',
    );
  });

  it('does not warn about a future date for a stage the phase has not claimed', () => {
    const result = fixture({
      'content/teams/devops.yaml': DEVOPS_TEAM,
      'content/streamlines/devops/kubernetes-upgrade.md': streamline({
        extra: phases(`
  - name: Phase 1
    audience: Pilot teams
    status: rolling-out
    timeline:
      rolling-out: 2026-01-01
      generally-available: 2099-01-01`),
      }),
    });

    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
  });
});
