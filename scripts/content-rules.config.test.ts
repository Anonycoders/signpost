import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

import { describe, expect, it, vi } from 'vitest';

/**
 * Rules that only say the right thing on a differently configured site.
 *
 * The lifecycle is configuration, and the promise made in docs/adopting.md is
 * that an organization can rename every stage without editing code. These
 * tests hold that promise honest for the one rule that used to know two stage
 * names by heart: a streamline that is going away must say when it ends. The
 * Slack rule below is here for the same reason from the other direction — it
 * has to go quiet once the workspace exists.
 *
 * A separate file from content-rules.test.ts because the whole point is a
 * different site.config, and the rules read it once at import.
 */

vi.mock('../site.config', () => {
  const siteConfig = {
    name: 'Atlas',
    locale: 'en-GB',
    slackWorkspaceUrl: 'https://atlas.slack.com',
    lifecycle: [
      { id: 'idea', label: 'Idea', description: 'Being considered.', tone: 'gray' },
      { id: 'live', label: 'Live', description: 'In production.', tone: 'green' },
      {
        id: 'sunsetting',
        label: 'Sunsetting',
        description: 'On its way out.',
        tone: 'amber',
        windingDown: true,
      },
      {
        id: 'switched-off',
        label: 'Switched off',
        description: 'Gone.',
        tone: 'gray',
        terminal: true,
      },
    ],
    categories: [{ id: 'platform', label: 'Platform', tone: 'blue' }],
    impactLevels: [
      { id: 'info', label: 'Info', description: 'Good to know.', tone: 'blue', weight: 10 },
    ],
  };

  return { siteConfig, default: siteConfig };
});

const { validateContent } = await import('./content-rules');

function fixture(files: Record<string, string>) {
  const root = mkdtempSync(join(tmpdir(), 'signpost-config-test-'));

  for (const [path, content] of Object.entries(files)) {
    const full = join(root, path);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, content);
  }

  return validateContent(join(root, 'content'), root);
}

const TEAM = `
name: Platform
mission: Runs the paved road.
channel: "#platform"
`;

function streamline(status: string, timeline: string) {
  return `---
title: Build cache
team: platform
category: platform
status: ${status}
summary: A shared cache for builds, so nobody compiles the same thing twice.
owners:
  - name: Ada Okonkwo
timeline:${timeline}
updates:
  - date: 2026-03-02
    impact: info
    title: Cache is live
---
`;
}

const messagesOf = (problems: Array<{ message: string }>) => problems.map((p) => p.message).join('\n');

describe('the anti-surprise rule on a renamed lifecycle', () => {
  it('names the organization own stages, not "deprecated" and "retired"', () => {
    const result = fixture({
      'content/teams/platform.yaml': TEAM,
      'content/streamlines/platform/build-cache.md': streamline(
        'sunsetting',
        `
  idea: 2025-11-01
  live: 2026-03-01
  sunsetting: 2026-08-01`,
      ),
    });

    expect(messagesOf(result.errors)).toContain(
      'A sunsetting streamline must say when it will be switched off',
    );
    expect(messagesOf(result.errors)).toContain('`switched-off` date');
    expect(messagesOf(result.errors)).not.toContain('retired');
  });

  it('is satisfied by a date on the renamed terminal stage', () => {
    const result = fixture({
      'content/teams/platform.yaml': TEAM,
      'content/streamlines/platform/build-cache.md': streamline(
        'sunsetting',
        `
  idea: 2025-11-01
  live: 2026-03-01
  sunsetting: 2026-08-01
  switched-off: 2027-02-01`,
      ),
    });

    expect(result.errors).toEqual([]);
  });

  it('leaves a stage that is merely not terminal alone', () => {
    const result = fixture({
      'content/teams/platform.yaml': TEAM,
      'content/streamlines/platform/build-cache.md': streamline(
        'live',
        `
  idea: 2025-11-01
  live: 2026-03-01`,
      ),
    });

    expect(result.errors).toEqual([]);
  });
});

describe('slack member IDs on a configured workspace', () => {
  it('says nothing, because the ids now have somewhere to point', () => {
    const result = fixture({
      'content/teams/platform.yaml': TEAM,
      'content/streamlines/platform/build-cache.md': streamline(
        'live',
        `
  idea: 2025-11-01
  live: 2026-03-01`,
      ).replace(
        '  - name: Ada Okonkwo',
        '  - name: Ada Okonkwo\n    slack: ada\n    slackId: U024BE7LH',
      ),
    });

    expect(result.errors).toEqual([]);
    expect(result.warnings.filter((warning) => warning.file === 'site.config.ts')).toEqual([]);
  });
});
