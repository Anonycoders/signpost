import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseSections, UNRELEASED, upgradeNote } from './changelog';
import { siteConfig } from '../site.config';

/**
 * Takes an update from the repository this one was forked from.
 *
 * A fork is a copy, so an update is a merge, and a merge is the one moment a
 * fork finds out what a release costs it. The notes for that were written
 * months earlier by the person who made the change — every release section
 * carries an `**Upgrading:**` line, required, precisely so that nobody has to
 * reconstruct it later. Until now nothing read them back. This does: it says
 * which releases you are behind and what each one asks of you, and it says it
 * *before* it touches your working tree, so the answer can be "not today".
 *
 * It never pushes. A merge is reversible while it is local and is not
 * afterwards, so the last step stays with whoever is watching.
 *
 * Note the `run`: `npm update` is npm's own command and will do something else
 * entirely. This is `npm run update`.
 */

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');

/** The conventional name for the remote a fork takes updates from. */
const REMOTE = 'template';

const DEFAULT_BRANCH = 'main';

export interface Release {
  version: string;
  date?: string;
  /** The section's upgrade note, as written. Absent if it has none. */
  upgrading?: string;
}

export interface Update {
  /** Where the updates are coming from. */
  url: string;
  branch: string;
  /** Commits the template has and this fork does not. */
  commits: number;
  /** Paths a merge would touch. */
  files: string[];
  /** Releases this fork is behind, newest first. */
  releases: Release[];
  /** Why there is no release list, when there is a reason worth saying. */
  unreadable?: string;
}

/**
 * The releases the template has published that this fork has not got.
 *
 * Membership, not arithmetic: a fork has a release when it has that release's
 * section, which is true the moment the merge lands and stays true afterwards.
 * Comparing version numbers instead would be a guess about a fork whose history
 * we cannot see — one that has cherry-picked, or that forked mid-version, would
 * be told something confidently wrong.
 */
export function releasesBehind(local: string, upstream: string): Release[] {
  const have = new Set(parseSections(local).map((section) => section.version));

  return parseSections(upstream)
    .filter((section) => section.version !== UNRELEASED && !have.has(section.version))
    .map((section) => ({
      version: section.version,
      date: section.date,
      upgrading: upgradeNote(section.body),
    }));
}

/**
 * What an update would bring, in the words of the people who wrote it.
 *
 * Pure, and printed before anything is touched. The decision this is meant to
 * support is whether to merge at all, and that decision is worth nothing after
 * the merge.
 */
export function updateReport(update: Update): string {
  const lines = [
    `${shortName(update.url)} has ${plural(update.commits, 'commit')} you do not, across ${plural(update.files.length, 'file')}.`,
  ];

  if (update.unreadable) {
    lines.push('', update.unreadable);
  } else if (update.releases.length === 0) {
    // Commits without a release between them: fixes on their way to one.
    lines.push('', 'No new releases — this is work in progress upstream.');
  } else {
    lines.push('', `${plural(update.releases.length, 'release')} behind:`, '');

    for (const release of update.releases) {
      lines.push(`  ${release.version}${release.date ? ` — ${release.date}` : ''}`);
      lines.push(
        ...(release.upgrading ?? 'No upgrade note.').split('\n').map((line) => `    ${line}`),
      );
      lines.push('');
    }

    lines.pop();
  }

  return lines.join('\n');
}

/** `Anonycoders/signpost` out of a URL, or the URL when it is not shaped like one. */
function shortName(url: string): string {
  const parts = url.replace(/\.git$/, '').replace(/\/+$/, '').split('/');

  return parts.length >= 2 ? parts.slice(-2).join('/') : url;
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}

function git(...args: string[]): string {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim();
}

/**
 * A git command whose failure is an expected answer rather than a problem.
 *
 * Silences stderr, because git narrates its failures: without this, asking
 * whether a remote exists prints `error: No such remote 'template'` above the
 * sentence that explains what to do about it, and the error people read first
 * is the one that helps least.
 */
function gitOrUndefined(...args: string[]): string | undefined {
  try {
    return execFileSync('git', args, {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return undefined;
  }
}

/**
 * The remote to fetch from, added if it is not there yet.
 *
 * An existing remote wins over the config. Somebody who has pointed their
 * `template` remote somewhere — a mirror, a fork of a fork, a local path while
 * they test something — has said what they mean, and a tool that silently
 * repointed it would be the kind of tool people stop trusting with a working
 * tree. It says so when the two disagree and leaves it alone.
 */
function templateRemote(): { url: string; branch: string } {
  const branch = siteConfig.template?.branch ?? DEFAULT_BRANCH;
  const existing = gitOrUndefined('remote', 'get-url', REMOTE);
  const configured = siteConfig.template?.url;

  if (existing) {
    if (configured && existing !== configured) {
      console.log(
        `Note: the "${REMOTE}" remote points at ${existing}, and site.config.ts says ${configured}. Using the remote.\n`,
      );
    }

    return { url: existing, branch };
  }

  if (!configured) {
    throw new Error(
      [
        `There is no "${REMOTE}" remote and site.config.ts does not say where this fork came from.`,
        '',
        'Set `template` in site.config.ts, or add the remote by hand:',
        '',
        `  git remote add ${REMOTE} https://github.com/your-org/signpost`,
      ].join('\n'),
    );
  }

  git('remote', 'add', REMOTE, configured);
  console.log(`Added the "${REMOTE}" remote, pointing at ${configured}.\n`);

  return { url: configured, branch };
}

/**
 * Refuses to start if tracked files are modified.
 *
 * Untracked files are deliberately not counted: a scratch file or an editor
 * directory is nobody's business here, and git refuses on its own if a merge
 * would actually overwrite one. What a dirty tracked file costs is the way
 * back — `git merge --abort` and `git reset --hard` restore the merge, not the
 * work that was sitting unsaved underneath it.
 */
function refuseIfDirty(): void {
  let dirty: string;

  try {
    dirty = git('status', '--porcelain', '--untracked-files=no');
  } catch {
    throw new Error(
      'Cannot run git here, so there is nothing to merge into. docs/adopting.md explains the fork-and-merge model this expects.',
    );
  }

  if (dirty !== '') {
    throw new Error(
      [
        'There are uncommitted changes:',
        '',
        dirty,
        '',
        'Commit or stash them first. A merge that goes wrong is undone with `git merge --abort`, and that puts back the merge — not work that was never committed.',
      ].join('\n'),
    );
  }
}

/**
 * Both changelogs, or the reason there is no release list.
 *
 * Read out of git rather than off disk, so that the comparison is between two
 * commits rather than between a commit and whatever happens to be in the
 * working tree.
 */
function changelogs(): { releases: Release[]; unreadable?: string } {
  const upstream = gitOrUndefined('show', 'FETCH_HEAD:CHANGELOG.md');

  if (upstream === undefined) {
    return {
      releases: [],
      unreadable: 'The template has no CHANGELOG.md, so there are no upgrade notes to show.',
    };
  }

  const local = gitOrUndefined('show', 'HEAD:CHANGELOG.md');

  if (local === undefined) {
    return {
      releases: [],
      unreadable:
        "This fork has no CHANGELOG.md, so there is no telling which releases it already has. Read the template's before merging.",
    };
  }

  return { releases: releasesBehind(local, upstream) };
}

function main(): void {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const unknown = args.filter((arg) => arg !== '--dry-run');

  if (unknown.length > 0) {
    console.error(`Unknown option: ${unknown[0]}\nUsage: npm run update [-- --dry-run]`);
    process.exit(2);
  }

  try {
    refuseIfDirty();

    const { url, branch } = templateRemote();

    console.log(`Fetching ${branch} from ${shortName(url)}…\n`);
    git('fetch', REMOTE, branch);

    const commits = Number(git('rev-list', '--count', 'HEAD..FETCH_HEAD'));

    if (commits === 0) {
      console.log('Already up to date.');
      return;
    }

    const files = git('diff', '--name-only', 'HEAD...FETCH_HEAD').split('\n').filter(Boolean);
    const update: Update = { url, branch, commits, files, ...changelogs() };

    console.log(updateReport(update));

    if (dryRun) {
      console.log('\nNothing was changed. Drop --dry-run to merge.');
      return;
    }

    merge(update);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

function merge(update: Update): void {
  const versions = update.releases.map((release) => release.version);
  const message = [
    'Merge the template',
    '',
    versions.length > 0
      ? `Brings ${versions.reverse().join(', ')}. The upgrade notes are in CHANGELOG.md.`
      : 'Upstream work in progress; no new releases.',
  ].join('\n');

  try {
    git('merge', '--no-edit', '-m', message, 'FETCH_HEAD');
  } catch {
    reportConflicts();
    process.exit(1);
  }

  console.log('\nMerged.');

  if (update.files.includes('package.json') || update.files.includes('package-lock.json')) {
    console.log('\nThe dependencies moved, so start with:\n\n  npm install');
  }

  console.log(
    [
      '',
      'Then the gate, which is what CI will run anyway:',
      '',
      '  npm run validate && npm run check && npm test && npm run build',
      '',
      `  git push origin ${siteConfig.repository.branch}`,
      '',
      'Nothing has left this machine yet — `git reset --hard ORIG_HEAD` puts it all back.',
    ].join('\n'),
  );
}

/**
 * What stopped, and which side to keep.
 *
 * The advice is not "keep yours". `site.config.ts` is the file most likely to
 * conflict and the one where keeping only your side silently drops the field a
 * release just added — which is exactly the kind of loss an upgrade note cannot
 * warn you about, because upstream does not know you edited that line.
 */
function reportConflicts(): void {
  const conflicted = (gitOrUndefined('diff', '--name-only', '--diff-filter=U') ?? '')
    .split('\n')
    .filter(Boolean);

  console.error(
    [
      '',
      `The merge stopped on ${plural(conflicted.length, 'file')}:`,
      '',
      ...conflicted.map((file) => `  ${file}`),
      '',
      'Fix each one, `git add` it, then `git commit` — the merge message is already written. `git merge --abort` puts everything back.',
    ].join('\n'),
  );

  if (conflicted.includes('site.config.ts')) {
    console.error(
      '\nsite.config.ts is the one to read rather than overwrite. A release that adds a config field adds it here, and keeping only your side drops it.',
    );
  }

  if (conflicted.some((file) => file.startsWith('content/'))) {
    console.error(
      '\nA conflict under content/ means the template has started shipping a file where you keep your own — it normally ships nothing there but two empty placeholders. Your content is yours; keep your side unless an upgrade note above says otherwise.',
    );
  }
}

// Only when run as a script — the tests import the reading and the report.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
