import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

import { describe, expect, it, vi } from 'vitest';

import type { Problem } from './content-rules';

/**
 * The warning that fires when a site announces its changes but a streamline
 * has nowhere for its announcements to go.
 *
 * Worth a rule because the failure is invisible from both ends: the run works
 * out what changed, finds no channel, and drops it — which looks exactly like a
 * streamline that changed nothing. Nobody notices until the thing is switched
 * off, which is the surprise this project exists to prevent.
 *
 * A file of its own for the reason set out in content-rules.slack.test.ts: a
 * rule about configuration cannot be tested through whatever configuration the
 * repository happens to ship, and the repository ships this feature off. The
 * other half of the pair is in content-rules.config.test.ts, whose config names
 * a site-wide channel and whose job is to prove this then goes quiet.
 */

vi.mock('../site.config', () => {
  const siteConfig = {
    name: 'Atlas',
    locale: 'en-GB',
    announcements: {
      siteUrl: 'https://atlas.example.com',
      // No `channel`. That is the whole premise of this file: without a
      // site-wide fallback, every streamline has to be routed by itself or by
      // its team.
    },
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
  const root = mkdtempSync(join(tmpdir(), 'signpost-announce-test-'));

  for (const [path, content] of Object.entries(files)) {
    const full = join(root, path);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, content);
  }

  return validateContent(join(root, 'content'), root);
}

function team(extra = '') {
  return `
name: Platform
mission: Runs the paved road.
channel: "#platform"${extra}
`;
}

function streamline(title: string, extra = '') {
  return `title: ${title}
team: platform
category: platform
status: live
summary: A shared cache for builds, so nobody compiles the same thing twice.
owners:
  - name: Ada Okonkwo
timeline:
  idea: 2025-11-01
  live: 2026-03-01${extra}
updates:
  - date: 2026-03-02
    impact: info
    title: Cache is live
`;
}

/** Type-only, so it is erased before the mock above has anything to do. */
type Result = { warnings: Problem[] };

const about = (result: Result, field: string) =>
  result.warnings.filter((warning) => warning.field === field);

/**
 * Both field names begin "announce", and nothing else does. The fixtures carry
 * dates, so they eventually go stale and warn about that instead — which is a
 * true warning about a fixture and no business of these tests.
 */
const routing = (result: Result) =>
  result.warnings.filter((warning) => warning.field?.startsWith('announce'));

describe('announcements with nowhere to go', () => {
  it('points at the config when nothing anywhere names a channel', () => {
    // One line in site.config.ts fixes every streamline at once. A copy of that
    // instruction per file would be longer without being more helpful.
    const result = fixture({
      'content/teams/platform.yaml': team(),
      'content/streamlines/platform/build-cache.yaml': streamline('Build cache'),
      'content/streamlines/platform/runner-fleet.yaml': streamline('Runner fleet'),
    });

    const warnings = about(result, 'announcements.channel');

    expect(result.errors).toEqual([]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.file).toBe('site.config.ts');
    expect(warnings[0]?.message).toContain('no channel is named anywhere');
    expect(about(result, 'announceChannel')).toEqual([]);
  });

  it('names the file when some streamlines are routed and one is not', () => {
    // Here the fix really is per-file: the others prove the config is fine.
    const result = fixture({
      'content/teams/platform.yaml': team(),
      'content/streamlines/platform/build-cache.yaml': streamline(
        'Build cache',
        '\nannounceChannel: "#build-news"',
      ),
      'content/streamlines/platform/runner-fleet.yaml': streamline('Runner fleet'),
    });

    const warnings = about(result, 'announceChannel');

    expect(result.errors).toEqual([]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.file).toBe('content/streamlines/platform/runner-fleet.yaml');
    expect(warnings[0]?.message).toContain('content/teams/platform.yaml');
    expect(about(result, 'announcements.channel')).toEqual([]);
  });

  it('is satisfied by a channel on the team', () => {
    const result = fixture({
      'content/teams/platform.yaml': team('\nannounceChannel: "#platform-news"'),
      'content/streamlines/platform/build-cache.yaml': streamline('Build cache'),
    });

    expect(result.errors).toEqual([]);
    expect(routing(result)).toEqual([]);
  });

  it('says nothing about a streamline that has asked to stay quiet', () => {
    const result = fixture({
      'content/teams/platform.yaml': team(),
      'content/streamlines/platform/build-cache.yaml': streamline(
        'Build cache',
        '\nannounce: false',
      ),
    });

    expect(result.errors).toEqual([]);
    expect(routing(result)).toEqual([]);
  });
});

describe('the channel field itself', () => {
  it('rejects a bare name, which Slack will not resolve', () => {
    const result = fixture({
      'content/teams/platform.yaml': team('\nannounceChannel: platform-news'),
      'content/streamlines/platform/build-cache.yaml': streamline('Build cache'),
    });

    expect(result.errors.map((error) => error.message).join('\n')).toContain(
      'A channel is either its name with the # (#platform-news) or its ID (C0123ABCD)',
    );
  });

  it('accepts a channel ID, which is what survives a rename', () => {
    const result = fixture({
      'content/teams/platform.yaml': team('\nannounceChannel: C0123ABCD'),
      'content/streamlines/platform/build-cache.yaml': streamline('Build cache'),
    });

    expect(result.errors).toEqual([]);
    expect(routing(result)).toEqual([]);
  });
});
