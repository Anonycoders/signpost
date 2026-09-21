import { describe, expect, it } from 'vitest';

import { upgradeNote } from './changelog';
import { releasesBehind, updateReport, type Update } from './update';

/**
 * An update is the moment a fork pays for a release, and the report is the only
 * thing standing between somebody and a merge they have not agreed to. So the
 * tests hold two things: that "behind" is counted from what a fork actually
 * has, and that the notes somebody wrote months ago arrive intact.
 */

const UPSTREAM = `# Changelog

## [Unreleased]

**Upgrading:** Nothing to do.

### Added

- Something not released yet.

## [0.3.0] - 2026-10-02

**Upgrading:** \`team:\` in every streamline now has to name a file in
\`content/teams/\`. Run \`npm run validate\` after merging; it names any that
do not.

### Changed

- Teams are a directory now.

## [0.2.0] - 2026-09-21

**Upgrading:** Nothing to do.

### Added

- A release command.

## [0.1.0] - 2026-09-20

**Upgrading:** Nothing to do. This is the first release.

### Added

- Everything.

[Unreleased]: https://example.com/acme/signpost/compare/v0.3.0...HEAD
[0.3.0]: https://example.com/acme/signpost/compare/v0.2.0...v0.3.0
[0.2.0]: https://example.com/acme/signpost/compare/v0.1.0...v0.2.0
[0.1.0]: https://example.com/acme/signpost/releases/tag/v0.1.0
`;

/** A fork that merged through 0.1.0 and has not taken an update since. */
const FORK = UPSTREAM.replace(/## \[0\.3\.0\][\s\S]*?(?=## \[0\.1\.0\])/, '');

describe('which releases a fork is behind', () => {
  it('is the ones it has no section for, newest first', () => {
    expect(releasesBehind(FORK, UPSTREAM).map((one) => one.version)).toEqual(['0.3.0', '0.2.0']);
  });

  it('is nothing when the fork is current', () => {
    expect(releasesBehind(UPSTREAM, UPSTREAM)).toEqual([]);
  });

  /**
   * Unreleased is upstream's scratch section, not a release. A fork merging
   * today gets those lines, but nobody has decided what they are worth yet,
   * and a report that named it would be reporting a version that does not
   * exist.
   */
  it('never counts Unreleased', () => {
    expect(releasesBehind('# Changelog\n', UPSTREAM).map((one) => one.version)).toEqual([
      '0.3.0',
      '0.2.0',
      '0.1.0',
    ]);
  });

  /**
   * Membership, not arithmetic. A fork that took 0.3.0 early and skipped 0.2.0
   * is behind on 0.2.0 — comparing the highest version either side would have
   * told it the opposite.
   */
  it('does not assume a fork took the releases in order', () => {
    const skipped = UPSTREAM.replace(/## \[0\.2\.0\][\s\S]*?(?=## \[0\.1\.0\])/, '');

    expect(releasesBehind(skipped, UPSTREAM).map((one) => one.version)).toEqual(['0.2.0']);
  });

  it('carries the date and the upgrade note through', () => {
    const [newest] = releasesBehind(FORK, UPSTREAM);

    expect(newest?.date).toBe('2026-10-02');
    expect(newest?.upgrading).toContain('`team:` in every streamline');
    expect(newest?.upgrading).toContain('names any that\ndo not.');
  });
});

describe('the upgrade note', () => {
  it('is the paragraph, without its label', () => {
    expect(upgradeNote('**Upgrading:** Nothing to do.\n\n### Added\n\n- A thing.')).toBe(
      'Nothing to do.',
    );
  });

  it('keeps a note that runs over several lines', () => {
    expect(upgradeNote('**Upgrading:** Rename the field.\nThen run the validator.\n\n### Added')).toBe(
      'Rename the field.\nThen run the validator.',
    );
  });

  it('is absent when a section has none', () => {
    expect(upgradeNote('### Added\n\n- A thing.')).toBeUndefined();
  });

  // The same empty-note trap the changelog validator exists to catch.
  it('is absent when the label has nothing after it', () => {
    expect(upgradeNote('**Upgrading:**\n\n### Added')).toBeUndefined();
  });
});

describe('the report', () => {
  const update: Update = {
    url: 'https://github.com/Anonycoders/signpost',
    branch: 'main',
    commits: 14,
    files: ['CHANGELOG.md', 'src/lib/content.ts'],
    releases: releasesBehind(FORK, UPSTREAM),
  };

  /**
   * The whole first line, not a fragment of it. `toContain` would have passed
   * with the repository named by its full URL, because the short name is a
   * suffix of the long one — the assertion would have been satisfied by the
   * output it exists to rule out.
   */
  it('leads with the size of the thing being proposed', () => {
    expect(updateReport(update).split('\n')[0]).toBe(
      'Anonycoders/signpost has 14 commits you do not, across 2 files.',
    );
  });

  it('prints every upgrade note, which is the point of reading it at all', () => {
    const report = updateReport(update);

    expect(report).toContain('2 releases behind:');
    expect(report).toContain('0.3.0 — 2026-10-02');
    expect(report).toContain('`team:` in every streamline now has to name a file');
    expect(report).toContain('0.2.0 — 2026-09-21');
  });

  it('counts in ones without saying "1 releases"', () => {
    const one = { ...update, commits: 1, files: ['CHANGELOG.md'], releases: update.releases.slice(0, 1) };

    expect(updateReport(one)).toContain('has 1 commit you do not, across 1 file.');
    expect(updateReport(one)).toContain('1 release behind:');
  });

  /**
   * Commits with no release between them are normal — it is what upstream
   * looks like between tags — and saying nothing at all would read as though
   * the report had failed.
   */
  it('says so when there are commits but no new release', () => {
    expect(updateReport({ ...update, releases: [] })).toContain('work in progress upstream');
  });

  it('says why the releases are missing when they cannot be read', () => {
    const report = updateReport({ ...update, releases: [], unreadable: 'No CHANGELOG.md upstream.' });

    expect(report).toContain('No CHANGELOG.md upstream.');
    expect(report).not.toContain('work in progress');
  });

  /**
   * It is printed straight to a terminal, and whatever comes next — the merge,
   * or the dry-run's closing line — writes its own spacing. A report that ended
   * on the blank line between two releases would leave a gap that reads as
   * though something had been cut off.
   */
  it('does not end on a blank line', () => {
    expect(updateReport(update)).toMatch(/\S$/);
  });

  it('says when a release arrived without a note, rather than skipping it', () => {
    const report = updateReport({
      ...update,
      releases: [{ version: '0.4.0', date: '2026-11-01' }],
    });

    expect(report).toContain('0.4.0 — 2026-11-01');
    expect(report).toContain('No upgrade note.');
  });
});
