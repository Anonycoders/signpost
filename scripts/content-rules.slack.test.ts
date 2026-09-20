import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

import { describe, expect, it, vi } from 'vitest';

/**
 * The warning that fires when member IDs have been collected but no Slack
 * workspace has been configured for the site.
 *
 * It has to be tested against a site.config of its own, and this file exists
 * because it once was not. Asserting it through the repository's real config
 * only works while that config happens to leave `slackWorkspaceUrl` unset —
 * so the first organization to set it, including this project's own sample
 * instance, got a failing test suite for doing exactly what the docs tell them
 * to do. A rule about configuration cannot be tested through whatever
 * configuration the repository happens to ship.
 *
 * The other half of the pair lives in content-rules.config.test.ts, whose mock
 * does set a workspace, and whose job is to prove this warning then goes quiet.
 */

vi.mock('../site.config', () => {
  const siteConfig = {
    name: 'Atlas',
    locale: 'en-GB',
    // Deliberately absent. That is the whole premise of this file.
    lifecycle: [
      { id: 'idea', label: 'Idea', description: 'Being considered.', tone: 'gray' },
      { id: 'live', label: 'Live', description: 'In production.', tone: 'green' },
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
  const root = mkdtempSync(join(tmpdir(), 'signpost-slack-test-'));

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

function streamline(title: string) {
  return `---
title: ${title}
team: platform
category: platform
status: live
summary: A shared cache for builds, so nobody compiles the same thing twice.
owners:
  - name: Ada Okonkwo
    slack: ada
    slackId: U024BE7LH
timeline:
  idea: 2025-11-01
  live: 2026-03-01
updates:
  - date: 2026-03-02
    impact: info
    title: Cache is live
---
`;
}

describe('slack member IDs with no workspace to point at', () => {
  it('warns once, against the file that has to change', () => {
    // One line fixes it, whether two streamlines carry ids or fifty. Repeating
    // the same instruction per streamline would bury the rest of the report.
    const result = fixture({
      'content/teams/platform.yaml': TEAM,
      'content/streamlines/platform/build-cache.md': streamline('Build cache'),
      'content/streamlines/platform/runner-fleet.md': streamline('Runner fleet'),
    });

    const configWarnings = result.warnings.filter(
      (warning) => warning.file === 'site.config.ts',
    );

    expect(result.errors).toEqual([]);
    expect(configWarnings).toHaveLength(1);
    expect(configWarnings[0]?.message).toContain('2 streamlines');
    expect(configWarnings[0]?.message).toContain('no Slack workspace is configured');
  });

  it('names the single file when only one carries ids', () => {
    const result = fixture({
      'content/teams/platform.yaml': TEAM,
      'content/streamlines/platform/build-cache.md': streamline('Build cache'),
    });

    const configWarning = result.warnings.find((warning) => warning.file === 'site.config.ts');

    expect(configWarning?.message).toContain('content/streamlines/platform/build-cache.md');
  });
});
