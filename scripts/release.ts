import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  changelogProblems,
  compareVersions,
  isVersion,
  parseSections,
  todayUtc,
  UNRELEASED,
} from './changelog';
import { siteConfig } from '../site.config';

/**
 * Cuts a release: closes the Unreleased section, opens a fresh one, and makes
 * the commit the tag will point at.
 *
 * Everything this does was a step somebody followed by hand, and the hand
 * version had a failure mode worth removing. The first real release of this
 * repository was tagged before its section existed, because moving a heading,
 * repointing two link definitions and setting a version in a second file are
 * four chances to do three of them. The release workflow caught it — it is
 * built to — but being caught at the tag is a worse place to find out than
 * being caught before the commit.
 *
 * What it does NOT do is write the notes. Those are hand-written, one line at
 * a time, as the changes land; this only decides that what has accumulated is
 * now a version, and dates it.
 *
 * The commit is made here because it is local and reversible. The push and the
 * tag are not, so they stay the releaser's.
 */

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');

/** A version heading, so a cut can find the one it is opening under. */
const UNRELEASED_HEADING = `## [${UNRELEASED}]`;

/** The note a fresh Unreleased section starts life with. */
const EMPTY_UPGRADE_NOTE = '**Upgrading:** Nothing to do.';

/** `"version": "1.2.3"` in package.json, wherever it sits. */
const PACKAGE_VERSION = /^(\s*"version":\s*")([^"]*)(")/m;

export interface Cut {
  /** CHANGELOG.md, rewritten. */
  changelog: string;
  /** The notes that will become the body of the release. */
  notes: string;
  /** The version this replaces, if there was one. */
  previous?: string;
}

export interface CutOptions {
  /** The release date, as `YYYY-MM-DD`. */
  today: string;
  /** Where this repository lives, for the compare links. */
  repositoryUrl: string;
}

/**
 * The file as it should read once `version` is released, or an explanation of
 * why it cannot be.
 *
 * Pure, and separate from everything that touches the disk, because the thing
 * worth testing is the rewriting: what moves, what is left behind, and which
 * of the ways this can be asked for at the wrong moment are refused.
 */
export function cutRelease(text: string, version: string, options: CutOptions): Cut {
  if (!isVersion(version)) {
    throw new Error(`"${version}" is not a version. Write it as MAJOR.MINOR.PATCH — for example 0.2.0.`);
  }

  // A cut rewrites the file, so it starts from one that is already right.
  // Anything else and the mistake is carried into a release and dated.
  const problems = changelogProblems(text);
  if (problems.length > 0) {
    throw new Error(
      ['CHANGELOG.md has to be in order before it can be released:', '', ...problems].join('\n'),
    );
  }

  const sections = parseSections(text);
  const unreleased = sections[0];
  const previous = sections[1]?.version;

  if (!unreleased || unreleased.version !== UNRELEASED) {
    throw new Error(`CHANGELOG.md has no [${UNRELEASED}] section to release.`);
  }

  // Every entry lives under a category heading, so no category means nothing
  // has been written down — whatever else the section happens to contain.
  if (!/^### /m.test(unreleased.body)) {
    throw new Error(
      `There is nothing to release. [${UNRELEASED}] holds no entries — add one under a category heading (### Added, ### Fixed, and so on) before cutting a version.`,
    );
  }

  const clash = sections.find((section) => section.version === version);
  if (clash) {
    throw new Error(
      `CHANGELOG.md already has a section for ${version}, dated ${clash.date}. Releases are not re-cut; pick the next version.`,
    );
  }

  if (previous && compareVersions(version, previous) <= 0) {
    throw new Error(
      `${version} is not newer than ${previous}, the last release. Versions only go up — docs/releasing.md says what each part of the number promises.`,
    );
  }

  const base = options.repositoryUrl.replace(/\/+$/, '');
  const changelog = withLinkDefinitions(
    text.replace(
      UNRELEASED_HEADING,
      [
        UNRELEASED_HEADING,
        '',
        EMPTY_UPGRADE_NOTE,
        '',
        `## [${version}] - ${options.today}`,
      ].join('\n'),
    ),
    version,
    previous,
    base,
  );

  // The cutter's own output is held to the same rules as anything a person
  // writes. If this ever fires it is a bug here, not a mistake by the releaser.
  const written = changelogProblems(changelog);
  if (written.length > 0) {
    throw new Error(
      ['The rewritten CHANGELOG.md would not be valid. This is a bug:', '', ...written].join('\n'),
    );
  }

  const notes = parseSections(changelog).find((section) => section.version === version)?.body ?? '';

  return { changelog, notes, previous };
}

/**
 * The link definitions at the foot of the file, brought up to date: Unreleased
 * now compares against the new tag, and the new version gets a definition of
 * its own.
 *
 * A first release has nothing to compare against, so it links to its own tag
 * page instead of a range that would start from nowhere.
 */
function withLinkDefinitions(
  text: string,
  version: string,
  previous: string | undefined,
  base: string,
): string {
  const added = previous
    ? `[${version}]: ${base}/compare/v${previous}...v${version}`
    : `[${version}]: ${base}/releases/tag/v${version}`;

  return text.replace(
    new RegExp(`^\\[${UNRELEASED}\\]:.*$`, 'm'),
    [`[${UNRELEASED}]: ${base}/compare/v${version}...HEAD`, added].join('\n'),
  );
}

/** package.json with its version set, or an explanation. */
export function setPackageVersion(text: string, version: string): string {
  if (!PACKAGE_VERSION.test(text)) {
    throw new Error('package.json has no "version" field to set.');
  }

  return text.replace(PACKAGE_VERSION, `$1${version}$3`);
}

function git(...args: string[]): string {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim();
}

/**
 * Refuses to start if the two files it rewrites are already edited.
 *
 * It commits by path, so unrelated work elsewhere in the tree is safe and
 * stays uncommitted. Edits to these two files are a different matter: they
 * would be swept into a commit that says only "Cut 1.2.3".
 */
function refuseIfDirty(): void {
  let dirty: string;

  try {
    dirty = git('status', '--porcelain', '--', 'CHANGELOG.md', 'package.json');
  } catch {
    throw new Error(
      'Cannot run git here, so this cannot make the commit. docs/releasing.md has the steps to cut a release by hand.',
    );
  }

  if (dirty !== '') {
    throw new Error(
      [
        'CHANGELOG.md or package.json has uncommitted changes:',
        '',
        dirty,
        '',
        'Commit or stash them first. A cut rewrites both files and commits them by name, and it will not put somebody else\'s edit inside a release commit.',
      ].join('\n'),
    );
  }
}

function main(): void {
  const version = process.argv[2];

  if (!version) {
    console.error('Usage: npm run release -- <version>   (for example 0.2.0)');
    process.exit(2);
  }

  const changelogPath = join(ROOT, 'CHANGELOG.md');
  const packagePath = join(ROOT, 'package.json');

  try {
    refuseIfDirty();

    const cut = cutRelease(readFileSync(changelogPath, 'utf8'), version, {
      today: todayUtc(),
      repositoryUrl: siteConfig.repository.url,
    });

    writeFileSync(changelogPath, cut.changelog);
    writeFileSync(packagePath, setPackageVersion(readFileSync(packagePath, 'utf8'), version));

    try {
      git('commit', '--quiet', '-m', `Cut ${version}`, '--', 'CHANGELOG.md', 'package.json');
    } catch (error) {
      // The files are already rewritten, and correctly. Saying only "git
      // failed" would leave somebody looking at a modified tree wondering
      // whether any of it is safe to keep.
      throw new Error(
        [
          `CHANGELOG.md and package.json are rewritten for ${version}, but the commit failed:`,
          '',
          error instanceof Error ? error.message : String(error),
          '',
          `Read the diff, then commit it yourself: git commit -m 'Cut ${version}' -- CHANGELOG.md package.json`,
        ].join('\n'),
      );
    }

    report(version, cut);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

function report(version: string, cut: Cut): void {
  const branch = siteConfig.repository.branch;

  console.log(`Cut ${version}${cut.previous ? `, after ${cut.previous}` : ''}. This is what it will publish:\n`);
  console.log(`${cut.notes}\n`);
  console.log('Two commands left, and both are yours:\n');
  console.log(`  git push origin ${branch}`);
  console.log(`  git tag -a v${version} -m 'Signpost ${version}' && git push origin v${version}\n`);
  console.log(
    `The tag push is what publishes the release. Until then nothing has left this machine — the cut is one local commit, and \`git reset --soft HEAD~1\` takes it back.`,
  );
}

// Only when run as a script — the tests import the rewriting directly.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
