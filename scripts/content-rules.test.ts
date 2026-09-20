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

  return `title: Kubernetes upgrade
team: ${team}
category: infrastructure
status: ${status}
summary: Cluster-wide upgrade that affects workloads on removed beta APIs.
owners:
  - name: Jana Okafor
    github: janaokafor
timeline:${timeline}${extra}
body: |
  Body text.
updates:${updates}
`;
}

const messagesOf = (problems: Array<{ message: string }>) =>
  problems.map((problem) => problem.message).join('\n');

describe('valid content', () => {
  it('accepts a well-formed team and streamline', () => {
    const result = fixture({
      'content/teams/devops.yaml': DEVOPS_TEAM,
      'content/streamlines/devops/kubernetes-upgrade.yaml': streamline(),
    });

    expect(result.errors).toEqual([]);
    expect(result.counts).toEqual({ teams: 1, streamlines: 1 });
  });

  it('allows a streamline to skip lifecycle stages', () => {
    const result = fixture({
      'content/teams/devops.yaml': DEVOPS_TEAM,
      'content/streamlines/devops/kubernetes-upgrade.yaml': streamline({
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
      'content/streamlines/platform/kubernetes-upgrade.yaml': streamline({ team: 'platform' }),
    });

    expect(messagesOf(result.errors)).toContain('There is no team called "platform"');
    expect(messagesOf(result.errors)).toContain('devops');
  });

  it('rejects a streamline filed under a different team than it claims', () => {
    const result = fixture({
      'content/teams/devops.yaml': DEVOPS_TEAM,
      'content/teams/ai-platform.yaml': 'name: AI Platform\nmission: Shared model access.\n',
      'content/streamlines/devops/kubernetes-upgrade.yaml': streamline({ team: 'ai-platform' }),
    });

    const problem = result.errors.find((error) => error.field === 'team');
    expect(problem?.message).toContain('team must be "devops"');
    expect(problem?.file).toBe('content/streamlines/devops/kubernetes-upgrade.yaml');
  });
});

describe('timeline coherence', () => {
  it('rejects stages dated out of lifecycle order, naming both stages', () => {
    const result = fixture({
      'content/teams/devops.yaml': DEVOPS_TEAM,
      'content/streamlines/devops/kubernetes-upgrade.yaml': streamline({
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
      'content/streamlines/devops/kubernetes-upgrade.yaml': streamline({
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
      'content/streamlines/devops/kubernetes-upgrade.yaml': streamline({
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
      'content/streamlines/devops/kubernetes-upgrade.yaml': streamline({
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
      'content/streamlines/devops/jenkins.yaml': streamline({
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
      'content/streamlines/devops/jenkins.yaml': streamline({
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
      'content/streamlines/devops/kubernetes-upgrade.yaml': streamline({
        extra: '\nsupersedes: devops/does-not-exist',
      }),
    });

    expect(messagesOf(result.errors)).toContain(
      'content/streamlines/devops/does-not-exist.yaml',
    );
  });

  it('resolves a supersedes that does exist', () => {
    const result = fixture({
      'content/teams/devops.yaml': DEVOPS_TEAM,
      'content/streamlines/devops/jenkins.yaml': streamline({
        status: 'deprecated',
        timeline: `
  generally-available: 2021-04-05
  deprecated: 2026-02-16
  retired: 2027-03-31`,
      }),
      'content/streamlines/devops/actions.yaml': streamline({
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
      'content/streamlines/devops/orphan.yaml': `title: Orphaned work
team: devops
category: infrastructure
status: proposed
summary: Something nobody has put their name against.
owners: []
timeline:
  proposed: 2026-01-15
updates: []
`,
    });

    expect(messagesOf(result.errors)).toContain('at least one owner');
  });

  it('accepts an owner reachable only on Slack', () => {
    // The point of the field: a team that lives in chat can name a reachable
    // owner without inventing a GitHub account or publishing an email address.
    const result = fixture({
      'content/teams/devops.yaml': DEVOPS_TEAM,
      'content/streamlines/devops/kubernetes-upgrade.yaml': streamline().replace(
        '    github: janaokafor',
        '    slack: jana.okafor',
      ),
    });

    expect(result.errors).toEqual([]);
  });

  it('accepts an owner reachable both ways', () => {
    const result = fixture({
      'content/teams/devops.yaml': DEVOPS_TEAM,
      'content/streamlines/devops/kubernetes-upgrade.yaml': streamline().replace(
        '    github: janaokafor',
        '    github: janaokafor\n    slack: jana.okafor',
      ),
    });

    expect(result.errors).toEqual([]);
  });

  it('rejects a slack handle written with the @', () => {
    const result = fixture({
      'content/teams/devops.yaml': DEVOPS_TEAM,
      'content/streamlines/devops/kubernetes-upgrade.yaml': streamline().replace(
        '    github: janaokafor',
        '    slack: "@jana.okafor"',
      ),
    });

    expect(messagesOf(result.errors)).toContain(
      'A slack handle is the handle only, without the @ or a URL.',
    );
  });

  it('rejects a slack handle written as a URL', () => {
    const result = fixture({
      'content/teams/devops.yaml': DEVOPS_TEAM,
      'content/streamlines/devops/kubernetes-upgrade.yaml': streamline().replace(
        '    github: janaokafor',
        '    slack: https://example.slack.com/team/U024BE7LH',
      ),
    });

    expect(messagesOf(result.errors)).toContain(
      'A slack handle is the handle only, without the @ or a URL.',
    );
  });

  it('accepts a member ID alongside the handle', () => {
    const result = fixture({
      'content/teams/devops.yaml': DEVOPS_TEAM,
      'content/streamlines/devops/kubernetes-upgrade.yaml': streamline().replace(
        '    github: janaokafor',
        '    slack: jana.okafor\n    slackId: U024BE7LH',
      ),
    });

    expect(result.errors).toEqual([]);
  });

  it('accepts an Enterprise Grid member ID', () => {
    const result = fixture({
      'content/teams/devops.yaml': DEVOPS_TEAM,
      'content/streamlines/devops/kubernetes-upgrade.yaml': streamline().replace(
        '    github: janaokafor',
        '    slack: jana.okafor\n    slackId: W1H63D8SZ',
      ),
    });

    expect(result.errors).toEqual([]);
  });

  it('rejects the handle written where the member ID goes', () => {
    // The likeliest mistake by a mile, and the one that would otherwise build a
    // link straight to a Slack page that does not exist.
    const result = fixture({
      'content/teams/devops.yaml': DEVOPS_TEAM,
      'content/streamlines/devops/kubernetes-upgrade.yaml': streamline().replace(
        '    github: janaokafor',
        '    slack: jana.okafor\n    slackId: jana.okafor',
      ),
    });

    expect(messagesOf(result.errors)).toContain('A slack member ID looks like U024BE7LH');
  });

  it('rejects a summary too long to fit on a card', () => {
    const result = fixture({
      'content/teams/devops.yaml': DEVOPS_TEAM,
      'content/streamlines/devops/wordy.yaml': streamline().replace(
        'summary: Cluster-wide upgrade that affects workloads on removed beta APIs.',
        `summary: ${'x'.repeat(240)}`,
      ),
    });

    expect(messagesOf(result.errors)).toContain('220 characters');
  });

  it('reports the field path for a problem inside an update', () => {
    const result = fixture({
      'content/teams/devops.yaml': DEVOPS_TEAM,
      'content/streamlines/devops/kubernetes-upgrade.yaml': streamline({
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
      'content/streamlines/devops/kubernetes-upgrade.yaml': streamline({
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
      'content/streamlines/devops/kubernetes-upgrade.yaml': streamline({
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
      'content/streamlines/devops/kubernetes-upgrade.yaml': streamline({
        updates: `
  - date: 2026-09-10
    effective: 2026-09-10
    impact: info
    title: Rollout has started`,
      }),
    });

    expect(result.errors.some((error) => error.field === 'updates[0].effective')).toBe(true);
  });

  it('rejects a file that is not valid YAML', () => {
    const result = fixture({
      'content/teams/devops.yaml': DEVOPS_TEAM,
      'content/streamlines/devops/broken.yaml': 'title: [unclosed\n',
    });

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.file).toBe('content/streamlines/devops/broken.yaml');
  });
});

describe('updates that share one identity', () => {
  /**
   * An update is identified by its date and its title, because that is all a
   * content file gives it. Two that reduce to the same anchor share a link on
   * the page and an entry id in the feed, and the second one effectively does
   * not exist — which is why this is an error and not a warning.
   */

  it('rejects two updates posted on the same day under the same title', () => {
    const result = fixture({
      'content/teams/devops.yaml': DEVOPS_TEAM,
      'content/streamlines/devops/kubernetes-upgrade.yaml': streamline({
        updates: `
  - date: 2026-09-10
    impact: info
    title: Rollout has started
  - date: 2026-09-10
    impact: breaking
    title: Rollout has started`,
      }),
    });

    const problem = result.errors.find((error) => error.field === 'updates[1].title');
    expect(problem?.message).toContain('updates[0]');
    expect(problem?.message).toContain('#update-2026-09-10-rollout-has-started');
    expect(problem?.message).toContain('a different title');
  });

  it('rejects two long titles that collide only once the slug is cut short', () => {
    // Neither title repeats the other, and nothing on the page looks wrong.
    // The slug stops at 48 characters, so both land on the same anchor.
    const result = fixture({
      'content/teams/devops.yaml': DEVOPS_TEAM,
      'content/streamlines/devops/kubernetes-upgrade.yaml': streamline({
        updates: `
  - date: 2026-09-10
    impact: breaking
    title: Ingress v1beta1 is removed from every production cluster
  - date: 2026-09-10
    impact: breaking
    title: Ingress v1beta1 is removed from every production namespace`,
      }),
    });

    const problem = result.errors.find((error) => error.field === 'updates[1].title');
    expect(problem?.message).toContain('#update-2026-09-10-ingress-v1beta1-is-removed-from-every');
  });

  it('accepts the same title posted on two different days', () => {
    // A recurring title is normal — "Wave 2 begins" happens more than once —
    // and the date is part of the anchor, so the two do not collide.
    const result = fixture({
      'content/teams/devops.yaml': DEVOPS_TEAM,
      'content/streamlines/devops/kubernetes-upgrade.yaml': streamline({
        updates: `
  - date: 2026-09-10
    impact: info
    title: Another wave begins
  - date: 2026-09-17
    impact: info
    title: Another wave begins`,
      }),
    });

    expect(result.errors).toEqual([]);
  });
});

describe('warnings', () => {
  it('flags a status its own timeline has already moved past', () => {
    const result = fixture({
      'content/teams/devops.yaml': DEVOPS_TEAM,
      'content/streamlines/devops/kubernetes-upgrade.yaml': streamline({
        status: 'rolling-out',
        timeline: `
  proposed: 2026-01-15
  rolling-out: 2026-03-02
  generally-available: 2026-06-01`,
      }),
    });

    const problem = result.warnings.find((warning) => warning.field === 'status');
    expect(result.errors).toEqual([]);
    expect(problem?.message).toContain('marked Rolling out');
    expect(problem?.message).toContain('reached Generally available on 2026-06-01');
  });

  it('leaves a status alone when the stage ahead of it is still a plan', () => {
    // The whole point of the timeline is that it holds dates that have not
    // happened. A status only lags once one of them has.
    const result = fixture({
      'content/teams/devops.yaml': DEVOPS_TEAM,
      'content/streamlines/devops/kubernetes-upgrade.yaml': streamline({
        status: 'rolling-out',
        timeline: `
  proposed: 2026-01-15
  rolling-out: 2026-03-02
  generally-available: 2099-01-01`,
      }),
    });

    expect(result.warnings).toEqual([]);
  });

  it('says nothing about announcement channels on a site that does not announce', () => {
    // The repository ships with `announcements` commented out, and a fork that
    // never turns it on should never be told about a field it has no use for.
    const result = fixture({
      'content/teams/devops.yaml': DEVOPS_TEAM,
      'content/streamlines/devops/kubernetes-upgrade.yaml': streamline({}),
    });

    expect(result.warnings.filter((warning) => warning.field?.includes('nnounce'))).toEqual([]);
  });

  it('flags an active streamline that has gone quiet, without failing the build', () => {
    const result = fixture({
      'content/teams/devops.yaml': DEVOPS_TEAM,
      'content/streamlines/devops/forgotten.yaml': streamline({
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
      'content/streamlines/devops/old-tool.yaml': streamline({
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
  /** A `phases:` block, indented to sit under the key. */
  const phases = (yaml: string) => `\nphases:${yaml}`;

  /**
   * A streamline timeline long enough to contain a phase dated 2099, so tests
   * using that sentinel get only the warning they are about and not the
   * separate rule that a timeline has to cover its own phases.
   */
  const COVERS_2099 = `
  proposed: 2026-01-15
  in-development: 2026-03-02
  rolling-out: 2026-09-01
  generally-available: 2099-01-01`;

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
      'content/streamlines/devops/kubernetes-upgrade.yaml': streamline({
        extra: PILOT_THEN_EVERYONE,
      }),
    });

    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it('accepts a phase with no timeline of its own', () => {
    const result = fixture({
      'content/teams/devops.yaml': DEVOPS_TEAM,
      'content/streamlines/devops/kubernetes-upgrade.yaml': streamline({
        extra: phases(`
  - name: Phase 1
    audience: Pilot teams
    status: rolling-out`),
      }),
    });

    expect(result.errors).toEqual([]);
  });

  it('accepts overlapping phases, which are how rollouts actually run', () => {
    // Deliberately no cross-phase ordering rule: a later phase may start
    // before an earlier one finishes, and may even be further along.
    const result = fixture({
      'content/teams/devops.yaml': DEVOPS_TEAM,
      'content/streamlines/devops/kubernetes-upgrade.yaml': streamline({
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
      'content/streamlines/devops/kubernetes-upgrade.yaml': streamline({
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

  it('rejects two phase names that differ only in their punctuation', () => {
    const result = fixture({
      'content/teams/devops.yaml': DEVOPS_TEAM,
      'content/streamlines/devops/kubernetes-upgrade.yaml': streamline({
        extra: phases(`
  - name: Phase 1 — pilot
    audience: Pilot teams
    status: proposed
  - name: Phase 1 / pilot
    audience: Everyone else
    status: proposed`),
      }),
    });

    expect(messagesOf(result.errors)).toContain(
      '"Phase 1 / pilot" and "Phase 1 — pilot" are different names that reduce to the same one ("phase-1-pilot") once punctuation is dropped.',
    );
    expect(result.errors[0]?.field).toBe('phases[1].name');
  });

  it('rejects a phase with no audience', () => {
    const result = fixture({
      'content/teams/devops.yaml': DEVOPS_TEAM,
      'content/streamlines/devops/kubernetes-upgrade.yaml': streamline({
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
      'content/streamlines/devops/kubernetes-upgrade.yaml': streamline({
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
      'content/streamlines/devops/kubernetes-upgrade.yaml': streamline({
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
      'content/streamlines/devops/kubernetes-upgrade.yaml': streamline({
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
      'content/streamlines/devops/kubernetes-upgrade.yaml': streamline({
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
      'content/streamlines/devops/kubernetes-upgrade.yaml': streamline({
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
      'content/streamlines/devops/kubernetes-upgrade.yaml': streamline({
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
      'content/streamlines/devops/kubernetes-upgrade.yaml': streamline({
        // Reaching far enough forward to cover the phase below, so this test
        // gets the one warning it is about and not the envelope rule as well.
        timeline: COVERS_2099,
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
      'content/streamlines/devops/kubernetes-upgrade.yaml': streamline({
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
      'content/streamlines/devops/kubernetes-upgrade.yaml': streamline({
        timeline: COVERS_2099,
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

describe('a streamline against its own phases', () => {
  const phases = (yaml: string) => `\nphases:${yaml}`;

  it('warns when the timeline stops before the last phase does', () => {
    // The disconnect a reader actually sees: the stepper finishes in September,
    // and directly below it in the same card sits a wave that has not started
    // until the following spring.
    const result = fixture({
      'content/teams/devops.yaml': DEVOPS_TEAM,
      'content/streamlines/devops/kubernetes-upgrade.yaml': streamline({
        extra: phases(`
  - name: Phase 1
    audience: Pilot teams
    status: rolling-out
    timeline:
      rolling-out: 2026-09-01
  - name: Phase 2
    audience: Everyone else
    status: proposed
    timeline:
      rolling-out: 2027-04-12`),
      }),
    });

    expect(result.errors).toEqual([]);
    expect(messagesOf(result.warnings)).toContain(
      'The timeline ends on 2026-09-01, but "Phase 2" runs to 2027-04-12 — the streamline finishes before its own rollout does. Extend the timeline, or correct the phase date.',
    );
    expect(result.warnings[0]?.field).toBe('timeline');
  });

  it('accepts a timeline that ends exactly where the last phase does', () => {
    const result = fixture({
      'content/teams/devops.yaml': DEVOPS_TEAM,
      'content/streamlines/devops/kubernetes-upgrade.yaml': streamline({
        extra: phases(`
  - name: Phase 1
    audience: Pilot teams
    status: rolling-out
    timeline:
      rolling-out: 2026-09-01`),
      }),
    });

    expect(result.warnings).toEqual([]);
  });

  it('warns when the status has run ahead of every audience', () => {
    const result = fixture({
      'content/teams/devops.yaml': DEVOPS_TEAM,
      'content/streamlines/devops/kubernetes-upgrade.yaml': streamline({
        status: 'generally-available',
        timeline: `
  proposed: 2026-01-15
  in-development: 2026-03-02
  rolling-out: 2026-06-01
  generally-available: 2026-09-01`,
        extra: phases(`
  - name: Phase 1
    audience: Pilot teams
    status: rolling-out
  - name: Phase 2
    audience: Everyone else
    status: proposed`),
      }),
    });

    expect(result.errors).toEqual([]);
    expect(messagesOf(result.warnings)).toContain(
      'This is marked Generally available, but no phase has got past Rolling out — by its own phases, no audience is there yet. Move a phase on, or take the status back.',
    );
    expect(result.warnings[0]?.field).toBe('status');
  });

  it('never warns about a phase that is ahead of its streamline, which is the design', () => {
    // A pilot reaching general availability while the thing as a whole is still
    // rolling out is the entire reason phases exist. If this ever starts
    // warning, the rule has been written in the wrong direction.
    const result = fixture({
      'content/teams/devops.yaml': DEVOPS_TEAM,
      'content/streamlines/devops/kubernetes-upgrade.yaml': streamline({
        extra: phases(`
  - name: Phase 1
    audience: Pilot teams
    status: generally-available
  - name: Phase 2
    audience: Everyone else
    status: rolling-out`),
      }),
    });

    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it('leaves a winding-down streamline alone, being past every stage a phase can hold', () => {
    const result = fixture({
      'content/teams/devops.yaml': DEVOPS_TEAM,
      'content/streamlines/devops/kubernetes-upgrade.yaml': streamline({
        status: 'deprecated',
        timeline: `
  proposed: 2026-01-15
  rolling-out: 2026-06-01
  deprecated: 2026-09-01
  retired: 2027-03-01`,
        extra: phases(`
  - name: Phase 1
    audience: Pilot teams
    status: rolling-out`),
      }),
    });

    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
  });
});

/**
 * The two ways a Slack member ID ends up doing nothing.
 *
 * Both are warnings rather than errors: the page is still correct, and nobody
 * should be blocked from merging a streamline over a contact detail. But both
 * fail silently otherwise — the author did the tedious work of copying IDs out
 * of Slack and got plain text for it, with nothing anywhere to say why.
 */
describe('slack member IDs that cannot link', () => {
  it('warns when an ID has no handle to attach to', () => {
    const result = fixture({
      'content/teams/devops.yaml': DEVOPS_TEAM,
      'content/streamlines/devops/kubernetes-upgrade.yaml': streamline().replace(
        '    github: janaokafor',
        '    github: janaokafor\n    slackId: U024BE7LH',
      ),
    });

    expect(result.errors).toEqual([]);
    expect(messagesOf(result.warnings)).toContain(
      'Jana Okafor has a slack member ID but no slack handle',
    );
  });

  it('says nothing when the handles carry no IDs', () => {
    const result = fixture({
      'content/teams/devops.yaml': DEVOPS_TEAM,
      'content/streamlines/devops/kubernetes-upgrade.yaml': streamline().replace(
        '    github: janaokafor',
        '    slack: jana.okafor',
      ),
    });

    expect(result.warnings.filter((w) => w.file === 'site.config.ts')).toEqual([]);
  });
});
