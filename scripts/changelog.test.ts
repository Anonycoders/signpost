import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { changelogProblems, parseSections, releaseNotes, versionProblem } from './changelog';

/**
 * A release is published from CHANGELOG.md by a workflow that runs once, on a
 * tag that has already been pushed and cannot be taken back. There is no second
 * try and nobody watching, so everything that could be wrong with the file has
 * to be wrong here first, in a test that runs on every pull request.
 *
 * Two kinds of check below: that the parser reads the format it claims to, and
 * that the real committed file is in that format.
 */

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');

const CHANGELOG = readFileSync(join(ROOT, 'CHANGELOG.md'), 'utf8');

/** A well-formed file, so a test can spoil exactly one thing about it. */
const SAMPLE = `# Changelog

Some prose about the file, which belongs to nobody.

## [Unreleased]

**Upgrading:** Nothing to do.

### Added

- A thing that is not released yet.

## [1.2.0] - 2026-09-14

**Upgrading:** Nothing to do — merge and carry on.

### Added

- A capability.

### Fixed

- A mistake.

## [1.1.0] - 2026-08-02

**Upgrading:** Re-run \`npm run schema\` after merging.

### Changed

- The shape of something.

[Unreleased]: https://example.com/compare/v1.2.0...HEAD
[1.2.0]: https://example.com/compare/v1.1.0...v1.2.0
[1.1.0]: https://example.com/releases/tag/v1.1.0
`;

describe('reading the file', () => {
  it('finds every version, newest first', () => {
    expect(parseSections(SAMPLE).map((one) => one.version)).toEqual(['Unreleased', '1.2.0', '1.1.0']);
  });

  it('takes the date from the heading, and leaves Unreleased without one', () => {
    const [unreleased, released] = parseSections(SAMPLE);

    expect(unreleased?.date).toBeUndefined();
    expect(released?.date).toBe('2026-09-14');
  });

  /**
   * The categories are `###`. If the heading pattern were not anchored to two
   * hashes exactly, every "Added" in the file would become its own version and
   * a release would publish one bullet.
   */
  it('does not mistake a category for a version', () => {
    expect(parseSections(SAMPLE).map((one) => one.version)).not.toContain('Added');
  });

  it('keeps the prose above the first version out of every section', () => {
    expect(parseSections(SAMPLE).some((one) => one.body.includes('belongs to nobody'))).toBe(false);
  });

  /**
   * The definitions sit at the foot of the file, under the oldest version,
   * which is not where they belong — they are the file's plumbing. Left in,
   * they are published as the body of whichever release happens to be last.
   */
  it('keeps the link definitions out of the last section', () => {
    const last = parseSections(SAMPLE).at(-1);

    expect(last?.body).not.toContain('https://example.com');
    expect(last?.body.endsWith('- The shape of something.')).toBe(true);
  });
});

describe('the notes for one release', () => {
  it('are that version section, and only that one', () => {
    const notes = releaseNotes(SAMPLE, '1.2.0');

    expect(notes).toContain('A capability.');
    expect(notes).toContain('A mistake.');
    expect(notes).not.toContain('not released yet');
    expect(notes).not.toContain('The shape of something.');
  });

  it('are found whether the tag carries its v or not', () => {
    expect(releaseNotes(SAMPLE, 'v1.2.0')).toBe(releaseNotes(SAMPLE, '1.2.0'));
  });

  it('keep the upgrade note, which is the part a fork came for', () => {
    expect(releaseNotes(SAMPLE, '1.1.0')).toContain('**Upgrading:** Re-run `npm run schema`');
  });

  it('refuse a version the file does not mention', () => {
    // The likeliest real failure: the tag was pushed before the section was
    // written. Better a red workflow than a release with an empty body.
    expect(() => releaseNotes(SAMPLE, '9.9.9')).toThrow(/no section for 9\.9\.9/);
  });

  it('refuse to release the section that means not released', () => {
    expect(() => releaseNotes(SAMPLE, 'Unreleased')).toThrow(/no tag for Unreleased/);
  });

  /**
   * Otherwise the advice is to go and write `## [release-1.2.0] - …`, a heading
   * `changelogProblems` would then reject. Nothing is more disheartening than a
   * tool that tells you to do the thing it is about to complain about.
   */
  it('refuse a tag that is not a version, without suggesting a heading for it', () => {
    expect(() => releaseNotes(SAMPLE, 'release-1.2.0')).toThrow(/is not a version/);
    expect(() => releaseNotes(SAMPLE, 'release-1.2.0')).not.toThrow(/\[release-1\.2\.0\] - /);
  });

  it('refuse a section with nothing under it', () => {
    const empty = SAMPLE.replace(/\*\*Upgrading:\*\* Nothing to do — merge.*?- A mistake\./s, '');

    expect(() => releaseNotes(empty, '1.2.0')).toThrow(/says nothing/);
  });
});

describe('the two places the version number lives', () => {
  it('agree, or say which is which', () => {
    expect(versionProblem('1.2.0', 'v1.2.0')).toBeUndefined();
    expect(versionProblem('1.1.0', 'v1.2.0')).toContain('package.json says 1.1.0');
  });

  it('say nothing when the tag is not a version, so the real complaint leads', () => {
    expect(versionProblem('1.2.0', 'Unreleased')).toBeUndefined();
    expect(versionProblem('1.2.0', 'release-1.2.0')).toBeUndefined();
  });
});

describe('what counts as a malformed file', () => {
  const spoil = (from: string, to: string) => changelogProblems(SAMPLE.replace(from, to));

  it('nothing, when the file is well formed', () => {
    expect(changelogProblems(SAMPLE)).toEqual([]);
  });

  it('a released section with no date', () => {
    expect(spoil('## [1.2.0] - 2026-09-14', '## [1.2.0]')).toEqual(['[1.2.0] has no date. A released section reads "## [1.2.0] - YYYY-MM-DD".']);
  });

  it('a version that is not a version', () => {
    expect(spoil('## [1.2.0] - 2026-09-14', '## [next] - 2026-09-14').join('\n')).toContain(
      '[next] is not a version number',
    );
  });

  it('versions in the wrong order', () => {
    // Someone appending rather than prepending. Harmless to the parser, and it
    // puts the newest release at the bottom of the page nobody scrolls.
    const swapped = SAMPLE.replace('## [1.2.0]', '## [1.0.0]').replace(
      '[1.2.0]: https',
      '[1.0.0]: https',
    );

    expect(swapped).toContain('## [1.0.0]');
    expect(changelogProblems(swapped).join('\n')).toContain('[1.0.0] is listed above [1.1.0]');
  });

  it('a section without its upgrade note', () => {
    expect(spoil('**Upgrading:** Nothing to do — merge and carry on.', '').join('\n')).toContain(
      '[1.2.0] has no upgrade note',
    );
  });

  it('an upgrade note with nothing after the colon', () => {
    expect(spoil('**Upgrading:** Nothing to do.', '**Upgrading:**').join('\n')).toContain(
      '[Unreleased] has no upgrade note',
    );
  });

  it('a category of somebody own invention', () => {
    expect(spoil('### Fixed', '### Improvements').join('\n')).toContain(
      '[1.2.0] has a "Improvements" heading',
    );
  });

  it('a heading with no link definition', () => {
    expect(spoil('[1.1.0]: https://example.com/releases/tag/v1.1.0\n', '').join('\n')).toContain(
      '[1.1.0] has no link definition',
    );
  });

  it('a link definition with no heading', () => {
    expect(spoil('## [1.1.0] - 2026-08-02', '## [1.1.1] - 2026-08-02').join('\n')).toContain(
      'The link definition for [1.1.0] points at a section that is not here',
    );
  });

  it('a file that starts with a release instead of Unreleased', () => {
    const missing = SAMPLE.replace(/## \[Unreleased\][\s\S]*?(?=## \[1\.2\.0\])/, '').replace(
      '[Unreleased]: https://example.com/compare/v1.2.0...HEAD\n',
      '',
    );

    expect(changelogProblems(missing).join('\n')).toContain('The first section is "1.2.0"');
  });

  it('a file with no versions at all', () => {
    expect(changelogProblems('# Changelog\n\nNothing yet.\n')).toEqual([
      'No version sections. The file needs at least `## [Unreleased]`.',
    ]);
  });
});

describe('the committed CHANGELOG.md', () => {
  /**
   * The one test here that is not about the parser. It is what stops a pull
   * request from leaving the file in a state the release workflow cannot read,
   * and it is a test rather than its own CI step on purpose: a contributor who
   * forgets to add a line should hear that from a reviewer, not from a gate.
   */
  it('is in the format the release workflow reads', () => {
    expect(changelogProblems(CHANGELOG)).toEqual([]);
  });

  it('has somewhere for the next change to go', () => {
    expect(parseSections(CHANGELOG)[0]?.version).toBe('Unreleased');
  });
});
