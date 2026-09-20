import { slugify, updateAnchor } from '../src/lib/anchor';
import { withBase } from '../src/lib/base';
import { toPlainInline, toPlainText } from '../src/lib/markdown';
import { landsOn } from '../src/lib/updates';
import type { PhaseData, StreamlineData, TeamData, UpdateData } from '../src/lib/schema';

/**
 * Working out what is worth announcing, and what to say about it.
 *
 * Pure: no disk, no network, no clock. Today is a parameter, the ledger is a
 * parameter, and the result is a list of messages and a list of things to
 * remember. `announce.ts` does the reading, the posting and the writing around
 * it. That split is what makes it possible to answer "would this have sent
 * fifty messages?" in a test rather than in production.
 *
 * Nothing imported here reaches `site.config.ts` through an alias: everything
 * the rules need about a lifecycle or a locale arrives as an argument. A script
 * run by `tsx` resolves `@config` against the current directory rather than the
 * repository root, so a module that uses it works from one place and fails from
 * another.
 */

// ---------------------------------------------------------------------------
// The ledger
// ---------------------------------------------------------------------------

const LEDGER_VERSION = 1;

export interface LedgerEntry {
  /**
   * What was true about this the last time it went out. A different value now
   * is the difference between "nothing to say" and "this moved".
   */
  fingerprint: string;
  sentAt: string;
}

export interface Ledger {
  version: number;
  /**
   * Streamline id -> when this ledger first saw it. The record that stops a
   * first run announcing a roadmap's entire history in one burst.
   */
  streamlines: Record<string, { firstSeen: string }>;
  /** Announcement key -> what was sent. Never pruned. */
  entries: Record<string, LedgerEntry>;
}

export function emptyLedger(): Ledger {
  return { version: LEDGER_VERSION, streamlines: {}, entries: {} };
}

/**
 * Read a ledger, refusing anything this version cannot reason about.
 *
 * A future version might key entries differently, and treating its keys as
 * missing would announce everything in the roadmap at once. Stopping is the
 * only safe answer, and a failed run is loud where a hundred messages are not.
 */
export function parseLedger(text: string): Ledger {
  const raw = JSON.parse(text) as Partial<Ledger>;

  if (raw.version !== LEDGER_VERSION) {
    throw new Error(
      `This ledger is version ${String(raw.version)} and this version of Signpost writes ${LEDGER_VERSION}. Refusing to announce: a ledger it cannot read looks exactly like a ledger with nothing in it.`,
    );
  }

  return {
    version: LEDGER_VERSION,
    streamlines: raw.streamlines ?? {},
    entries: raw.entries ?? {},
  };
}

/** Keys sorted, so a diff between two runs shows what changed and not much else. */
export function serializeLedger(ledger: Ledger): string {
  const sorted = <T>(record: Record<string, T>): Record<string, T> =>
    Object.fromEntries(Object.entries(record).sort(([a], [b]) => a.localeCompare(b)));

  return `${JSON.stringify(
    {
      version: ledger.version,
      streamlines: sorted(ledger.streamlines),
      entries: sorted(ledger.entries),
    },
    null,
    2,
  )}\n`;
}

export interface LedgerUpdate {
  /** Streamline ids to mark as seen. */
  seen?: string[];
  /** Keys to store, against the fingerprint they were stored at. */
  store?: Array<{ key: string; fingerprint: string }>;
  /** Keys to forget — an update that was renamed out from under one. */
  drop?: string[];
}

export function applyToLedger(ledger: Ledger, change: LedgerUpdate, at: Date): Ledger {
  const sentAt = at.toISOString();
  const streamlines = { ...ledger.streamlines };
  const entries = { ...ledger.entries };

  for (const id of change.seen ?? []) {
    streamlines[id] ??= { firstSeen: sentAt };
  }

  for (const key of change.drop ?? []) {
    delete entries[key];
  }

  for (const { key, fingerprint } of change.store ?? []) {
    entries[key] = { fingerprint, sentAt };
  }

  return { version: ledger.version, streamlines, entries };
}

/**
 * Put `keys` back the way `before` had them.
 *
 * The run reserves every key in the ledger and pushes that before it posts
 * anything, so a failure to push means nothing was sent. The cost is that a
 * message which then fails to post is already written down as sent — this
 * undoes exactly those, and only those, so the next run tries again and says
 * the same thing it would have said.
 */
export function revertKeys(ledger: Ledger, before: Ledger, keys: string[]): Ledger {
  const entries = { ...ledger.entries };

  for (const key of keys) {
    const original = before.entries[key];
    if (original) entries[key] = original;
    else delete entries[key];
  }

  return { version: ledger.version, streamlines: ledger.streamlines, entries };
}

// ---------------------------------------------------------------------------
// What an announcement is
// ---------------------------------------------------------------------------

export interface Announcement {
  /** `<streamlineId>#<subject>#<reason>`. */
  key: string;
  fingerprint: string;
  channel: string;
  streamlineId: string;
  /** The day this is about, which is what a capped run drains in order of. */
  date: Date;
  /** The message, already in Slack's mrkdwn. */
  text: string;
}

export interface Collected {
  /** What to post, in the order to post it. */
  announcements: Announcement[];
  /**
   * Keys to write down without posting: everything belonging to a streamline
   * seen for the first time, and everything belonging to one that has asked to
   * be kept quiet.
   */
  silent: Array<{ key: string; fingerprint: string }>;
  /** Streamline ids being recorded for the first time. */
  seeded: string[];
  /** Keys a renamed update left behind. */
  dropped: string[];
  /** Streamlines with something to say and nowhere to say it. */
  unroutable: string[];
  /** How many announcements the cap held back for the next run. */
  withheld: number;
}

export interface CollectInput {
  streamlines: Array<{ id: string; data: StreamlineData }>;
  /** Team slug -> team, for the channel and the name in a message. */
  teams: Map<string, TeamData>;
  ledger: Ledger;
  /** UTC midnight of the day this run belongs to. */
  today: Date;
  /** The site's public address, base path and all. */
  siteUrl: string;
  locale: string;
  lifecycle: Array<{ id: string; label: string }>;
  impactLevels: Array<{ id: string; label: string }>;
  channel?: string;
  lookbackDays?: number;
  maxPerRun?: number;
}

const DEFAULT_LOOKBACK_DAYS = 14;
const DEFAULT_MAX_PER_RUN = 10;

const MS_PER_DAY = 86_400_000;
const iso = (date: Date): string => date.toISOString().slice(0, 10);

/**
 * A streamline's page, on a site that may or may not be installed at a root.
 *
 * Built with the same `withBase` the site itself uses, so a fork published
 * under `/signpost/` gets links that work rather than links that 404.
 */
export function streamlineUrl(id: string, siteUrl: string): string {
  const base = new URL(siteUrl);
  return new URL(withBase(`/streamlines/${id}`, base.pathname), base).href;
}

// ---------------------------------------------------------------------------
// Subjects: the things that can change
// ---------------------------------------------------------------------------

type Subject =
  | { kind: 'update'; update: UpdateData }
  | { kind: 'stage'; stageId: string; date: Date }
  | { kind: 'phase'; phase: PhaseData; stageId: string; date: Date };

interface Candidate {
  /** The middle third of the key. */
  subject: string;
  fingerprint: string;
  /** The day it is about: what the lookback window and the cap sort on. */
  date: Date;
  detail: Subject;
}

/**
 * Everything about one streamline that could be announced, whether or not it
 * has changed. The ledger decides which of these are news.
 *
 * Three kinds, because three different things move under a reader: a team posts
 * an update, the streamline as a whole reaches a stage, and one audience's
 * phase reaches a stage ahead of or behind the rest.
 */
function candidatesFor(data: StreamlineData, lifecycle: Array<{ id: string }>): Candidate[] {
  const candidates: Candidate[] = [];

  for (const update of data.updates) {
    candidates.push({
      subject: updateAnchor(update),
      // The impact is in the fingerprint because raising an update from Info to
      // Breaking is the whole message, even when no date moved.
      fingerprint: `${iso(landsOn(update))}|${update.impact}`,
      date: landsOn(update),
      detail: { kind: 'update', update },
    });
  }

  const timeline = data.timeline as Record<string, Date | undefined>;

  for (const stage of lifecycle) {
    const date = timeline[stage.id];
    if (!(date instanceof Date)) continue;

    candidates.push({
      subject: `stage-${stage.id}`,
      fingerprint: iso(date),
      date,
      detail: { kind: 'stage', stageId: stage.id, date },
    });
  }

  for (const phase of data.phases) {
    const phaseTimeline = (phase.timeline ?? {}) as Record<string, Date | undefined>;

    for (const stage of lifecycle) {
      const date = phaseTimeline[stage.id];
      if (!(date instanceof Date)) continue;

      candidates.push({
        subject: `phase-${slugify(phase.name)}-${stage.id}`,
        fingerprint: iso(date),
        date,
        detail: { kind: 'phase', phase, stageId: stage.id, date },
      });
    }
  }

  return candidates;
}

// ---------------------------------------------------------------------------
// Wording
// ---------------------------------------------------------------------------

interface Wording {
  locale: string;
  label: (stageId: string) => string;
  impact: (impactId: string) => string;
}

/**
 * Slack's three control characters, in text Signpost did not write.
 *
 * `&`, `<` and `>` are how mrkdwn marks up links and mentions, so a title that
 * contains one is not shown — it is parsed. `Q&A` starts an entity that eats
 * what follows it, and `<beta>` vanishes into a link that was never there.
 * Slack's rule is that the three become HTML entities wherever they are not
 * doing that job, which in a streamline title or a team name is always.
 *
 * Everything out of a content file goes through this, the `announcement`
 * override included. No field is documented as carrying Slack markup, and a
 * rule with one exception is a rule somebody writes past.
 */
function escapeText(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * The same, for the label half of `<url|label>`.
 *
 * Slack documents the delimiter and says nothing at all about a second `|`
 * inside the label, so a pipe in a title lands on unspecified behaviour: it may
 * be printed, or it may take the URL with it and leave a broken link. Rather
 * than depend on an answer nobody has written down, the label never carries
 * one. A slash reads as the author meant it and cannot be mistaken for the
 * delimiter. The URLs are built from slugs and never contain a pipe, so this is
 * the only half that can.
 */
function escapeLabel(text: string): string {
  return escapeText(text).replace(/\|/g, '/');
}

function formatDay(value: Date | string, locale: string): string {
  const date = typeof value === 'string' ? new Date(`${value}T00:00:00Z`) : value;

  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

/**
 * The sentence an announcement leads with.
 *
 * It never says a thing "is now" anything. `status:` is authored separately
 * from `timeline:`, so a streamline can hold a past `generally-available` date
 * while its badge still reads "Rolling out" — a message claiming a state would
 * then contradict the page it links to. Dates cannot contradict anything: they
 * are what the file says, and they are what a reader has to plan around. It is
 * also the language the changes page already uses.
 */
function sentenceFor(subject: Subject, previous: string | undefined, words: Wording): string {
  const { locale } = words;

  if (subject.kind === 'stage') {
    const label = escapeText(words.label(subject.stageId));
    const [was] = (previous ?? '').split('|');

    if (was && was !== iso(subject.date)) {
      return `${label} moved from ${formatDay(was, locale)} to ${formatDay(subject.date, locale)}.`;
    }

    return `${label} on ${formatDay(subject.date, locale)}.`;
  }

  if (subject.kind === 'phase') {
    const label = escapeText(words.label(subject.stageId));
    const who = `${escapeText(subject.phase.name)}, for ${escapeText(subject.phase.audience)}`;
    const [was] = (previous ?? '').split('|');

    if (was && was !== iso(subject.date)) {
      return `${who}: ${label} moved from ${formatDay(was, locale)} to ${formatDay(subject.date, locale)}.`;
    }

    return `${who}: ${label} on ${formatDay(subject.date, locale)}.`;
  }

  const { update } = subject;
  const impact = escapeText(words.impact(update.impact));
  const lands = landsOn(update);
  const title = `*${escapeText(update.title)}*`;

  if (previous) {
    const [wasDate, wasImpact] = previous.split('|');

    if (wasDate && wasDate !== iso(lands)) {
      return `${title} — moved from ${formatDay(wasDate, locale)} to ${formatDay(lands, locale)}.`;
    }

    if (wasImpact && wasImpact !== update.impact) {
      return `${title} — ${impact}, was ${escapeText(words.impact(wasImpact))}.`;
    }
  }

  if (update.effective) {
    return `${title} — ${impact}, landing ${formatDay(update.effective, locale)}.`;
  }

  return `${title} — ${impact}, posted ${formatDay(update.date, locale)}.`;
}

/** The prose under the sentence, if the file gives any. */
function bodyFor(subject: Subject): string | undefined {
  if (subject.kind !== 'update') return undefined;

  // An override was written for chat, so it goes out as written. A body was
  // written for the page, so it is flattened first — Markdown that a browser
  // renders arrives in Slack as its own punctuation.
  if (subject.update.announcement) return escapeText(subject.update.announcement.trim());
  if (subject.update.body) return escapeText(toPlainText(subject.update.body, 400));

  return undefined;
}

/**
 * What the reader has to do, as its own lines under the prose.
 *
 * Bulleted rather than numbered, unlike the feed's one-line summary: a chat
 * message has real newlines, and `•` is what mrkdwn leaves alone — it has no
 * list syntax of its own to reach for.
 *
 * These are not in the fingerprint, deliberately. Rewording an instruction is
 * the most ordinary edit an author makes to an update that has already been
 * announced, and re-announcing it would teach people that the channel repeats
 * itself. The date and the impact are what make it news; this is detail
 * carried alongside, and the link is there for whoever wants the current list.
 *
 * Flattened to words first, then escaped, exactly as the body above is. Slack
 * has its own formatting language and it is not Markdown; translating between
 * the two would be a second renderer to keep honest, for the sake of a bold
 * word in a chat message. What matters is that the instruction arrives, and it
 * arrives as text.
 */
function actionsFor(subject: Subject): string[] {
  if (subject.kind !== 'update') return [];

  return (subject.update.actions ?? []).map((action) => `• ${escapeText(toPlainInline(action))}`);
}

function messageFor(
  subject: Subject,
  previous: string | undefined,
  streamline: { id: string; data: StreamlineData },
  teamName: string,
  siteUrl: string,
  words: Wording,
): string {
  const page = streamlineUrl(streamline.id, siteUrl);
  const href = subject.kind === 'update' ? `${page}#${updateAnchor(subject.update)}` : page;

  const lines = [
    `<${href}|${escapeLabel(streamline.data.title)}> · ${escapeText(teamName)}`,
    sentenceFor(subject, previous, words),
  ];

  const body = bodyFor(subject);
  if (body) lines.push(body);

  lines.push(...actionsFor(subject));

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Collecting
// ---------------------------------------------------------------------------

/**
 * Work out what this run should say.
 *
 * The rule that shapes everything else: **a streamline the ledger has never
 * seen announces nothing.** Its keys are written down and the run moves on.
 * Without that, the first run on an existing roadmap posts every dated thing in
 * it — for the sample instance that is over fifty messages, and a window on the
 * past cannot help, because most of them are dated in the future. Seeding makes
 * bulk import safe by construction and turns a lost ledger into one quiet day
 * rather than a storm.
 */
export function collectAnnouncements(input: CollectInput): Collected {
  const {
    streamlines,
    teams,
    ledger,
    today,
    siteUrl,
    locale,
    lifecycle,
    impactLevels,
    channel: siteChannel,
    lookbackDays = DEFAULT_LOOKBACK_DAYS,
    maxPerRun = DEFAULT_MAX_PER_RUN,
  } = input;

  const stageLabels = new Map(lifecycle.map((stage) => [stage.id, stage.label]));
  const impactLabels = new Map(impactLevels.map((impact) => [impact.id, impact.label]));
  const words: Wording = {
    locale,
    label: (id) => stageLabels.get(id) ?? id,
    impact: (id) => impactLabels.get(id) ?? id,
  };

  const floor = today.getTime() - lookbackDays * MS_PER_DAY;

  const announcements: Announcement[] = [];
  const silent: Array<{ key: string; fingerprint: string }> = [];
  const seeded: string[] = [];
  const dropped: string[] = [];
  const unroutable: string[] = [];

  for (const streamline of streamlines) {
    const { id, data } = streamline;
    const team = teams.get(data.team);
    const candidates = candidatesFor(data, lifecycle);

    const fresh = ledger.streamlines[id] === undefined;
    // `announce: false` still records, so switching it back on later picks up
    // from that moment instead of replaying the months it was off.
    const quiet = data.announce === false;

    if (fresh) seeded.push(id);

    if (fresh || quiet) {
      for (const candidate of candidates) {
        const key = `${id}#${candidate.subject}#change`;
        // Only what has actually moved, so a quiet streamline does not rewrite
        // its own timestamps into the ledger on every run.
        if (ledger.entries[key]?.fingerprint === candidate.fingerprint) continue;
        silent.push({ key, fingerprint: candidate.fingerprint });
      }
      continue;
    }

    const channel = data.announceChannel ?? team?.announceChannel ?? siteChannel;
    const known = new Set(candidates.map((candidate) => `${id}#${candidate.subject}#change`));

    for (const candidate of candidates) {
      const key = `${id}#${candidate.subject}#change`;
      const previous = ledger.entries[key]?.fingerprint;

      if (previous === candidate.fingerprint) continue;

      // A title fixed after the fact mints a new key, because the old one was
      // built from the old words. Carry the entry across rather than announcing
      // the same update twice under two names.
      if (previous === undefined && candidate.detail.kind === 'update') {
        const renamed = renamedFrom(ledger, id, candidate.detail.update, known);

        if (renamed) {
          dropped.push(renamed);
          silent.push({ key, fingerprint: candidate.fingerprint });
          continue;
        }
      }

      // Old news, dug up. A date backfilled into last year is not worth an
      // interruption; anything still ahead always is, however far ahead.
      if (candidate.date.getTime() < floor) {
        silent.push({ key, fingerprint: candidate.fingerprint });
        continue;
      }

      if (!channel) {
        if (!unroutable.includes(id)) unroutable.push(id);
        continue;
      }

      announcements.push({
        key,
        fingerprint: candidate.fingerprint,
        channel,
        streamlineId: id,
        date: candidate.date,
        text: messageFor(
          candidate.detail,
          previous,
          streamline,
          team?.name ?? data.team,
          siteUrl,
          words,
        ),
      });
    }
  }

  // Oldest first, so a run that hits the cap drains its backlog in order
  // instead of sending the same few messages every time and starving the rest.
  announcements.sort((a, b) => a.date.getTime() - b.date.getTime() || a.key.localeCompare(b.key));

  const withheld = Math.max(0, announcements.length - maxPerRun);

  return {
    announcements: announcements.slice(0, maxPerRun),
    silent,
    seeded,
    dropped,
    unroutable,
    withheld,
  };
}

/**
 * The key an update used to be filed under, if it was renamed rather than
 * added.
 *
 * An anchor is the posting date and the title, so the date is the part that
 * survives a rewording. An entry for this streamline, on this date, that no
 * current update claims, and which is the only one of its kind, is that
 * rewording. Two of them is ambiguous, and guessing wrong would silence a real
 * update — the validator forbids two updates sharing a date and title, so in
 * practice one is what there is.
 */
function renamedFrom(
  ledger: Ledger,
  streamlineId: string,
  update: UpdateData,
  claimed: Set<string>,
): string | undefined {
  const prefix = `${streamlineId}#update-${iso(update.date)}-`;

  const orphans = Object.keys(ledger.entries).filter(
    (key) => key.startsWith(prefix) && key.endsWith('#change') && !claimed.has(key),
  );

  return orphans.length === 1 ? orphans[0] : undefined;
}
