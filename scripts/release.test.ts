import { describe, expect, it } from 'vitest';

import { changelogProblems, parseSections, releaseNotes } from './changelog';
import { cutRelease, setPackageVersion } from './release';

/**
 * Cutting a release rewrites the one file a release is made of, and the
 * rewrite is only ever run on the day it matters. So the tests do two things:
 * hold the result to the same rules a hand-written file is held to, and prove
 * that each of the ways this can be asked for at the wrong moment is refused
 * in words rather than obeyed.
 */

const OPTIONS = { today: '2026-09-21', repositoryUrl: 'https://example.com/acme/signpost' };

const BEFORE = `# Changelog

Some prose about the file.

## [Unreleased]

**Upgrading:** \`team:\` now has to name a file in \`content/teams/\`.

### Added

- Something new.

### Fixed

- Something that was wrong.

## [0.1.0] - 2026-09-14

**Upgrading:** Nothing to do.

### Added

- The first of everything.

[Unreleased]: https://example.com/acme/signpost/compare/v0.1.0...HEAD
[0.1.0]: https://example.com/acme/signpost/releases/tag/v0.1.0
`;

/** The same file with nothing written down yet — what a fresh cut leaves. */
const NOTHING_YET = BEFORE.replace(/### Added\n\n- Something new.\n\n### Fixed\n\n- Something that was wrong.\n\n/, '');

describe('what a cut produces', () => {
  const cut = cutRelease(BEFORE, '0.2.0', OPTIONS);

  it('is a valid changelog, by the same rules as a hand-written one', () => {
    expect(changelogProblems(cut.changelog)).toEqual([]);
  });

  it('dates the new section and leaves an empty Unreleased above it', () => {
    const sections = parseSections(cut.changelog);

    expect(sections.map((one) => one.version)).toEqual(['Unreleased', '0.2.0', '0.1.0']);
    expect(sections[1]?.date).toBe('2026-09-21');
    expect(sections[0]?.date).toBeUndefined();
  });

  it('moves the entries down, and nothing else with them', () => {
    const [unreleased, released] = parseSections(cut.changelog);

    expect(released?.body).toContain('- Something new.');
    expect(released?.body).toContain('- Something that was wrong.');
    expect(released?.body).toContain('**Upgrading:** `team:` now has to name a file');

    // The new section is exactly what the old one held, nothing invented.
    expect(released?.body).toBe(parseSections(BEFORE)[0]?.body);
    expect(unreleased?.body).toBe('**Upgrading:** Nothing to do.');
  });

  it('leaves the older releases untouched', () => {
    expect(releaseNotes(cut.changelog, '0.1.0')).toBe(releaseNotes(BEFORE, '0.1.0'));
  });

  it('is what the release workflow would publish', () => {
    expect(cut.notes).toBe(releaseNotes(cut.changelog, 'v0.2.0'));
  });

  it('repoints Unreleased at the new tag and gives the new version its own link', () => {
    expect(cut.changelog).toContain(
      '[Unreleased]: https://example.com/acme/signpost/compare/v0.2.0...HEAD',
    );
    expect(cut.changelog).toContain(
      '[0.2.0]: https://example.com/acme/signpost/compare/v0.1.0...v0.2.0',
    );
  });

  it('links a first release to its own tag, having nothing to compare against', () => {
    // The range link would have to start from a tag that does not exist.
    const first = BEFORE.replace(/## \[0\.1\.0\][\s\S]*?(?=\[Unreleased\]:)/, '').replace(
      '[0.1.0]: https://example.com/acme/signpost/releases/tag/v0.1.0\n',
      '',
    );

    expect(cutRelease(first, '0.1.0', OPTIONS).changelog).toContain(
      '[0.1.0]: https://example.com/acme/signpost/releases/tag/v0.1.0',
    );
  });

  it('reports what came before, so the caller can say so', () => {
    expect(cut.previous).toBe('0.1.0');
  });
});

describe('when a cut is refused', () => {
  it('nothing has been written down', () => {
    expect(() => cutRelease(NOTHING_YET, '0.2.0', OPTIONS)).toThrow(/nothing to release/);
  });

  /**
   * The second run of the same command. A cut leaves an Unreleased section
   * holding only its upgrade note, so running it again has to fail — and fail
   * saying why, not by quietly producing a version with no notes in it.
   */
  it('the same command is run twice', () => {
    const once = cutRelease(BEFORE, '0.2.0', OPTIONS).changelog;

    expect(() => cutRelease(once, '0.3.0', OPTIONS)).toThrow(/nothing to release/);
  });

  it('the version is not newer than the last one', () => {
    expect(() => cutRelease(BEFORE, '0.1.0', OPTIONS)).toThrow(
      /already has a section for 0\.1\.0, dated 2026-09-14/,
    );
    expect(() => cutRelease(BEFORE, '0.0.9', OPTIONS)).toThrow(/not newer than 0\.1\.0/);
  });

  /**
   * Asserted on the whole sentence, quoted argument and all. Take the argument
   * check away and these are still refused — the heading they would produce is
   * not a version either — but by the self-check at the end, which calls it a
   * bug in this file. That is no answer for somebody who has simply typed the
   * tag spelling, so the loose match would have passed on the wrong message.
   */
  it('the version is not a version', () => {
    expect(() => cutRelease(BEFORE, '0.2', OPTIONS)).toThrow(
      '"0.2" is not a version. Write it as MAJOR.MINOR.PATCH',
    );
    expect(() => cutRelease(BEFORE, 'v0.2.0', OPTIONS)).toThrow(
      '"v0.2.0" is not a version. Write it as MAJOR.MINOR.PATCH',
    );
  });

  /**
   * A cut rewrites the file, so it will not start from a broken one — the
   * mistake would be carried into a release and dated.
   */
  it('the file is not in order to begin with', () => {
    const broken = BEFORE.replace('**Upgrading:** Nothing to do.\n\n### Added\n\n- The first of everything.', '- The first of everything.');

    expect(() => cutRelease(broken, '0.2.0', OPTIONS)).toThrow(/has to be in order/);
    expect(() => cutRelease(broken, '0.2.0', OPTIONS)).toThrow(/\[0\.1\.0\] has no upgrade note/);
  });
});

describe('the version in package.json', () => {
  const PACKAGE = '{\n  "name": "signpost",\n  "version": "0.1.0",\n  "type": "module"\n}\n';

  it('is set without touching anything else', () => {
    expect(setPackageVersion(PACKAGE, '0.2.0')).toBe(
      '{\n  "name": "signpost",\n  "version": "0.2.0",\n  "type": "module"\n}\n',
    );
  });

  it('says so when there is nothing to set', () => {
    expect(() => setPackageVersion('{"name": "signpost"}', '0.2.0')).toThrow(/no "version" field/);
  });
});
