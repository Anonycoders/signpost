#!/usr/bin/env tsx
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { siteConfig } from '../site.config';
import {
  applyToLedger,
  collectAnnouncements,
  emptyLedger,
  parseLedger,
  revertKeys,
  serializeLedger,
  type Announcement,
  type Ledger,
  type LedgerEntry,
} from './announcements';
import { validateContent } from './content-rules';
import { loadStreamlines, loadTeams } from './load-content';
import { postMessage, SlackError } from './slack';

/**
 * Announce what has changed, in two halves.
 *
 * Run with no `--send`, it works out what to say, writes every key it intends
 * to use into the ledger, and leaves a plan file behind. The workflow then
 * pushes the ledger **before** anything is posted, and runs this again with
 * `--send` to do the posting.
 *
 * That order is the whole point. If the push fails, nothing has been said and
 * the next run says it instead: a red workflow and a day's delay, which is
 * recoverable. The other order risks saying something and then losing the record
 * of having said it, which is how a channel gets the same fifty messages twice.
 * The price is that a message which fails to post is already written down as
 * sent — so `--send` un-reserves exactly those keys, and the workflow pushes
 * that correction whatever else happened.
 *
 * Nothing here decides what is worth announcing; announcements.ts does, without
 * touching the disk or the network, so the decisions can be tested.
 */

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

const useColour = process.stdout.isTTY && !process.env.NO_COLOR;
const paint = (code: string, text: string) => (useColour ? `[${code}m${text}[0m` : text);
const red = (text: string) => paint('31', text);
const yellow = (text: string) => paint('33', text);
const green = (text: string) => paint('32', text);
const dim = (text: string) => paint('2', text);

interface Options {
  send: boolean;
  dryRun: boolean;
  seed: boolean;
  max?: number;
  stateDir: string;
  planFile: string;
}

function parseArgs(argv: string[]): Options {
  const options: Options = {
    send: false,
    dryRun: false,
    seed: false,
    stateDir: repoRoot,
    planFile: join(repoRoot, 'announce-plan.json'),
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const value = () => {
      const next = argv[index + 1];
      if (next === undefined) throw new Error(`${arg} needs a value.`);
      index += 1;
      return next;
    };

    if (arg === '--send') options.send = true;
    else if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--seed') options.seed = true;
    else if (arg === '--max') options.max = Number(value());
    else if (arg === '--state') options.stateDir = value();
    else if (arg === '--plan') options.planFile = value();
    else throw new Error(`Unknown option ${arg}. Try --dry-run, --seed, --max N, --send.`);
  }

  if (options.max !== undefined && (!Number.isInteger(options.max) || options.max < 0)) {
    throw new Error('--max takes a whole number of messages.');
  }

  return options;
}

/** The handover between the two halves of a run. */
interface Plan {
  announcements: Array<
    Pick<Announcement, 'key' | 'channel' | 'streamlineId' | 'text'> & {
      /**
       * What the ledger held for this key before the run reserved it, if
       * anything. Carried so that a message which fails to post can be put back
       * exactly as it was — a key merely deleted would come back next run as
       * "Retired on 30 June" instead of "moved from 31 March to 30 June".
       */
      previous?: LedgerEntry;
    }
  >;
}

function readLedger(path: string): Ledger {
  if (!existsSync(path)) return emptyLedger();
  return parseLedger(readFileSync(path, 'utf8'));
}

/** A mistyped flag is a person's mistake, not a bug: say so without a stack. */
function parseArgsOrExit(): Options {
  try {
    return parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(red(error instanceof Error ? error.message : String(error)));
    process.exit(2);
  }
}

const options = parseArgsOrExit();
const ledgerPath = join(options.stateDir, 'announced.json');

// ---------------------------------------------------------------------------
// Posting what a previous run planned
// ---------------------------------------------------------------------------

if (options.send) {
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) {
    console.error(red('SLACK_BOT_TOKEN is not set, so nothing can be posted.'));
    process.exit(1);
  }

  if (!existsSync(options.planFile)) {
    console.log(dim('No plan to send.'));
    process.exit(0);
  }

  const plan = JSON.parse(readFileSync(options.planFile, 'utf8')) as Plan;
  const reserved = readLedger(ledgerPath);
  const failed: string[] = [];
  let sent = 0;

  for (const announcement of plan.announcements) {
    try {
      await postMessage({ token, channel: announcement.channel, text: announcement.text });
      sent += 1;
      console.log(`${green('sent')} ${announcement.channel} ${dim(announcement.streamlineId)}`);
    } catch (error) {
      failed.push(announcement.key);
      const message = error instanceof SlackError ? error.message : String(error);
      console.error(`${red('failed')} ${announcement.channel} — ${message}`);
    }
  }

  if (failed.length > 0) {
    // Hand the failures back to the next run by undoing exactly their
    // reservations, from the values the planning half recorded alongside them.
    const before: Ledger = {
      version: reserved.version,
      streamlines: {},
      entries: Object.fromEntries(
        plan.announcements.flatMap((one) => (one.previous ? [[one.key, one.previous]] : [])),
      ),
    };

    const cleared = revertKeys(reserved, before, failed);
    writeFileSync(ledgerPath, serializeLedger(cleared));

    console.error(
      `\n${red(`${failed.length} of ${plan.announcements.length} could not be posted.`)} Their keys have been released, so the next run tries again.\n`,
    );
    process.exit(1);
  }

  console.log(`\n${green(`Posted ${sent} announcement${sent === 1 ? '' : 's'}.`)}\n`);
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Working out what to say
// ---------------------------------------------------------------------------

const announcements = siteConfig.announcements;

// An adopter who has not configured this has not opted in to it. A fork that
// merges the workflow and never touches site.config.ts gets a scheduled job
// that does nothing at all, which is the only inert default worth having.
if (!announcements) {
  console.log(dim('Announcements are not configured in site.config.ts. Nothing to do.'));
  process.exit(0);
}

if (!process.env.SLACK_BOT_TOKEN && !options.dryRun) {
  console.log(dim('No SLACK_BOT_TOKEN, so there is nowhere to post. Nothing to do.'));
  process.exit(0);
}

// An invalid file is skipped by the loader, so announcing around it would mean
// announcing everything in it the day somebody fixes it. Better to say nothing
// and be loud about why.
const { errors } = validateContent(join(repoRoot, 'content'), repoRoot);

if (errors.length > 0) {
  console.error(red(`content/ has ${errors.length} problem${errors.length === 1 ? '' : 's'}.`));
  console.error('Run `npm run validate` and fix them. Nothing is announced from content that does not parse.');
  process.exit(1);
}

const teams = loadTeams(join(repoRoot, 'content'), repoRoot);
const streamlines = loadStreamlines(join(repoRoot, 'content'), repoRoot);

const teamMap = new Map(
  teams.entries.flatMap((entry) => (entry.data ? [[entry.slug, entry.data] as const] : [])),
);
const loaded = streamlines.entries.flatMap((entry) =>
  entry.data ? [{ id: entry.id, data: entry.data }] : [],
);

const now = new Date();
const today = new Date(
  Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
);

const ledger = readLedger(ledgerPath);

const collected = collectAnnouncements({
  streamlines: loaded,
  teams: teamMap,
  ledger,
  today,
  siteUrl: announcements.siteUrl,
  locale: siteConfig.locale,
  lifecycle: siteConfig.lifecycle,
  impactLevels: siteConfig.impactLevels,
  channel: announcements.channel,
  lookbackDays: announcements.lookbackDays,
  // `--seed` records everything and says nothing, which is what a cap of zero
  // already means. Same code path, so there is one behaviour to reason about.
  maxPerRun: options.seed ? 0 : (options.max ?? announcements.maxPerRun),
});

for (const id of collected.unroutable) {
  console.error(
    `${yellow('warning')} ${id} has changes but no channel. Set announceChannel on it, on its team, or announcements.channel in site.config.ts.`,
  );
}

if (collected.seeded.length > 0) {
  console.log(
    dim(
      `${collected.seeded.length} streamline${collected.seeded.length === 1 ? '' : 's'} recorded for the first time. Nothing is announced for those — only what changes from here.`,
    ),
  );
}

if (collected.withheld > 0) {
  console.log(
    yellow(
      `${collected.withheld} more ${collected.withheld === 1 ? 'is' : 'are'} waiting behind the cap and will go out next run.`,
    ),
  );
}

if (options.dryRun) {
  for (const announcement of collected.announcements) {
    console.log(`\n${dim(`— ${announcement.channel} —`)}\n${announcement.text}`);
  }

  console.log(
    `\n${green('Dry run.')} ${dim(`Would post ${collected.announcements.length}, would record ${collected.silent.length + collected.announcements.length} key${collected.silent.length + collected.announcements.length === 1 ? '' : 's'}. Nothing was written.`)}\n`,
  );
  process.exit(0);
}

// Everything that is going out is written down before any of it is said.
const reserved = applyToLedger(
  ledger,
  {
    seen: collected.seeded,
    drop: collected.dropped,
    store: [
      ...collected.silent,
      ...collected.announcements.map(({ key, fingerprint }) => ({ key, fingerprint })),
    ],
  },
  new Date(),
);

writeFileSync(ledgerPath, serializeLedger(reserved));

const plan: Plan = {
  announcements: collected.announcements.map(({ key, channel, streamlineId, text }) => ({
    key,
    channel,
    streamlineId,
    text,
    // Read from the ledger as it was, before the reservation above overwrote it.
    ...(ledger.entries[key] ? { previous: ledger.entries[key] } : {}),
  })),
};

writeFileSync(options.planFile, `${JSON.stringify(plan, null, 2)}\n`);

console.log(
  `${green('Ledger updated.')} ${dim(`${collected.announcements.length} to post, ${collected.silent.length} recorded silently.`)}`,
);
