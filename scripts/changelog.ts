import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Reads CHANGELOG.md, so a release can be made of what is already written
 * there rather than of whatever the tag message happened to say.
 *
 * The changelog is written by hand, one line at a time, by whoever made the
 * change — not derived from commit subjects. That is deliberate: a generated
 * changelog is a list of commits with the prefixes still attached, and it
 * answers "what was done" when the only question a fork has is "what does this
 * mean for me". So nothing here writes the file. It parses it, and it complains
 * in words when the shape is wrong, because the one moment a malformed
 * changelog is discovered must not be the moment somebody pushes a tag.
 *
 * The format is Keep a Changelog. What this file actually depends on is
 * narrower, and worth stating because it is what a release breaks against:
 *
 *   - a version section opens with `## [1.2.3] - 2026-09-21`, or `## [Unreleased]`
 *   - nothing else in the file starts with `## `
 *   - a line like `[1.2.3]: https://…` is a link definition, not prose
 *
 * Everything between one such heading and the next belongs to that version, and
 * that text is what becomes the body of the GitHub Release.
 */

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');

/** The section changes accumulate in, before anybody decides to release them. */
export const UNRELEASED = 'Unreleased';

/**
 * The six headings Keep a Changelog defines, and no others.
 *
 * Closed on purpose. "### Improvements" and "### Added" in two different
 * releases describe the same thing under two names, and a reader comparing
 * versions has to work out that they are the same. The upgrade note is a
 * paragraph rather than a seventh category — see `UPGRADING`.
 */
const CATEGORIES = ['Added', 'Changed', 'Deprecated', 'Removed', 'Fixed', 'Security'];

/**
 * What a fork does about this release, however it is worded after the colon.
 *
 * Every section carries one, including Unreleased, and that is the point: the
 * person who makes a change that costs a fork something knows what it costs,
 * and writes it while they know. Left to release time it becomes a guess made
 * by whoever is tagging.
 *
 * The words have to start on the same line as the label. `\s` would have
 * spanned the blank line to the next heading, and `**Upgrading:**` with nothing
 * after it would have counted as an answer.
 */
const UPGRADING = /^\*\*Upgrading:\*\*[^\S\n]+\S/m;

const HEADING = /^## \[([^\]]+)\](?:\s+-\s+(\d{4}-\d{2}-\d{2}))?\s*$/;
const LINK_DEFINITION = /^\[([^\]]+)\]:\s+\S+\s*$/;
const SEMVER = /^\d+\.\d+\.\d+$/;

export interface Section {
  /** `Unreleased`, or the version exactly as the heading writes it. */
  version: string;
  /** The day it was released. Absent on Unreleased, required on the rest. */
  date?: string;
  /** Everything under the heading and above the next one, link definitions removed. */
  body: string;
}

/** Every version section in the file, in the order the file lists them. */
export function parseSections(text: string): Section[] {
  const sections: Section[] = [];
  let current: { version: string; date?: string; lines: string[] } | undefined;

  for (const line of text.split('\n')) {
    const heading = HEADING.exec(line);

    if (heading) {
      if (current) sections.push(finish(current));
      current = { version: heading[1] ?? '', date: heading[2], lines: [] };
      continue;
    }

    // A definition belongs to the file, not to whichever section it trails.
    if (current && !LINK_DEFINITION.test(line)) current.lines.push(line);
  }

  if (current) sections.push(finish(current));

  return sections;
}

function finish(current: { version: string; date?: string; lines: string[] }): Section {
  return { version: current.version, date: current.date, body: current.lines.join('\n').trim() };
}

/** The versions the link definitions at the foot of the file name. */
function linkedVersions(text: string): string[] {
  return text
    .split('\n')
    .map((line) => LINK_DEFINITION.exec(line)?.[1])
    .filter((version): version is string => version !== undefined);
}

/**
 * Everything wrong with the file, in words, or an empty list.
 *
 * Run as a test rather than as its own CI step. A contributor who forgets a
 * changelog line should hear it in review, from a person; a contributor who
 * breaks the file so that the next release publishes an empty body should hear
 * it from the machine, immediately, which is what this is for.
 */
export function changelogProblems(text: string): string[] {
  const problems: string[] = [];
  const sections = parseSections(text);

  if (sections.length === 0) {
    return ['No version sections. The file needs at least `## [Unreleased]`.'];
  }

  if (sections[0]?.version !== UNRELEASED) {
    problems.push(
      `The first section is "${sections[0]?.version}". It has to be [${UNRELEASED}] — that is where a change lands before anybody decides to release it.`,
    );
  }

  const released = sections.slice(1);

  for (const section of released) {
    const where = `[${section.version}]`;

    if (!SEMVER.test(section.version)) {
      problems.push(`${where} is not a version number. Write it as MAJOR.MINOR.PATCH.`);
    }
    if (!section.date) {
      problems.push(`${where} has no date. A released section reads "## ${where} - YYYY-MM-DD".`);
    }
  }

  const numbers = released.filter((section) => SEMVER.test(section.version));
  for (let index = 1; index < numbers.length; index += 1) {
    const [above, below] = [numbers[index - 1]?.version, numbers[index]?.version];
    if (above && below && compareVersions(above, below) <= 0) {
      problems.push(`[${above}] is listed above [${below}]. Newest first.`);
    }
  }

  for (const section of sections) {
    if (!UPGRADING.test(section.body)) {
      problems.push(
        `[${section.version}] has no upgrade note. Add a line starting "**Upgrading:**" saying what a fork does when it merges this — "Nothing to do." is an answer.`,
      );
    }

    for (const line of section.body.split('\n')) {
      const category = /^### (.+?)\s*$/.exec(line)?.[1];
      if (category && !CATEGORIES.includes(category)) {
        problems.push(
          `[${section.version}] has a "${category}" heading. Keep a Changelog defines ${CATEGORIES.join(', ')} — use one of those, or write it as prose.`,
        );
      }
    }
  }

  const linked = new Set(linkedVersions(text));
  for (const section of sections) {
    if (!linked.has(section.version)) {
      problems.push(
        `[${section.version}] has no link definition at the foot of the file, so its heading renders as literal brackets.`,
      );
    }
  }
  for (const version of linked) {
    if (!sections.some((section) => section.version === version)) {
      problems.push(`The link definition for [${version}] points at a section that is not here.`);
    }
  }

  return problems;
}

/** Newest first: positive when `a` is the later version. */
function compareVersions(a: string, b: string): number {
  const [x, y] = [a, b].map((version) => version.split('.').map(Number));

  for (let index = 0; index < 3; index += 1) {
    const difference = (x?.[index] ?? 0) - (y?.[index] ?? 0);
    if (difference !== 0) return difference;
  }

  return 0;
}

/** A tag name or a bare version, as the number alone. */
export function toVersion(tag: string): string {
  return tag.replace(/^v/, '');
}

/**
 * The notes for one released version, ready to be the body of a GitHub Release.
 *
 * Throws rather than returning an empty string, because the failure this
 * guards against is a release that publishes successfully with nothing in it —
 * which nobody notices until somebody goes looking for what changed.
 */
export function releaseNotes(text: string, tag: string): string {
  const version = toVersion(tag);

  if (version === UNRELEASED) {
    throw new Error(
      `There is no tag for ${UNRELEASED}. Releasing means moving that section under a version heading first — see docs/releasing.md.`,
    );
  }

  // Before looking for a section, because the alternative is telling somebody
  // to go and write "## [release-1.2.0]" — a heading this same file rejects.
  if (!SEMVER.test(version)) {
    throw new Error(
      `"${tag}" is not a version. A release tag reads v1.2.3, and the heading it looks for is "## [1.2.3]".`,
    );
  }

  const section = parseSections(text).find((one) => one.version === version);

  if (!section) {
    throw new Error(
      [
        `CHANGELOG.md has no section for ${version}.`,
        '',
        `A release is made of what is already written down, so the section has to exist before the tag does. Move [${UNRELEASED}] under "## [${version}] - ${today()}", add the link definition, commit, then tag.`,
        '',
        'docs/releasing.md has the whole sequence.',
      ].join('\n'),
    );
  }

  if (section.body === '') {
    throw new Error(`The section for ${version} is empty. A release with no notes says nothing.`);
  }

  return section.body;
}

/**
 * Whether the version in package.json agrees with the tag being released.
 *
 * Two places hold the number and they are edited in the same minute, which is
 * exactly the kind of pair that drifts. The tag is the one that is public and
 * cannot be moved, so it is the one treated as right here.
 */
export function versionProblem(packageVersion: string, tag: string): string | undefined {
  const version = toVersion(tag);

  // A tag that is not a version at all is somebody else's complaint, and a
  // louder one. Answering it here would lead with the advice to write
  // "version": "release-1.2.0" into package.json.
  if (!SEMVER.test(version)) return undefined;
  if (packageVersion === version) return undefined;

  return `package.json says ${packageVersion}, the tag says ${version}. Set "version" to ${version}, commit, and move the tag onto that commit.`;
}

/**
 * Today in UTC, for the date suggested in an error message.
 *
 * UTC rather than the releaser's own midnight, because the heading it goes into
 * sits beside a tag that GitHub dates in UTC, and two dates a day apart for the
 * same release is the kind of thing somebody later tries to explain.
 */
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function main(): void {
  const tag = process.argv[2];

  if (!tag) {
    console.error('Usage: tsx scripts/changelog.ts <version>   (for example 0.1.0, or v0.1.0)');
    process.exit(2);
  }

  const text = readFileSync(join(ROOT, 'CHANGELOG.md'), 'utf8');
  const packageVersion = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version;

  const problems = [...changelogProblems(text)];
  const mismatch = versionProblem(packageVersion, tag);
  if (mismatch) problems.push(mismatch);

  // Everything wrong, in one go. Whoever is reading this has already pushed a
  // tag; making them fix one thing, re-run, and find the next is unkind.
  let notes = '';
  try {
    notes = releaseNotes(text, tag);
  } catch (error) {
    problems.push(error instanceof Error ? error.message : String(error));
  }

  if (problems.length > 0) {
    console.error(problems.join('\n\n'));
    process.exit(1);
  }

  // The notes alone on stdout, so the workflow can redirect it to a file.
  console.log(notes);
}

// Only when run as a script — the tests import the parsing directly.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
