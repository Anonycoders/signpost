import { getCollection, type CollectionEntry } from 'astro:content';

import { siteConfig, type Category, type ImpactLevel, type LifecycleStage } from '@config';
import { DOCS_DIR, docRoute, docSummary, docTitle, readingMinutes } from './doc-links';
import type { Phase } from './phases';
import type { LinkData, OwnerData, StreamlineData, TeamData } from './schema';
import { getCategory, getImpact, getStage, isTerminalStage } from './taxonomy';
import { stageOn, type TimelineEntry } from './timeline';
import { url } from './url';

export type { Phase } from './phases';

/**
 * The shape every page reads.
 *
 * Content files stay minimal — a team slug, a status id — and everything
 * derived from them (labels, tones, hrefs, resolved cross-references, sorted
 * updates) is worked out once here rather than in each template.
 */

export interface Team {
  slug: string;
  name: string;
  mission: string;
  channel?: string;
  links: LinkData[];
  href: string;
  editUrl: string;
}

/**
 * A named owner, with their Slack profile resolved if it can be.
 *
 * The resolution happens here rather than in the template because it depends
 * on configuration as well as content — the workspace comes from site.config,
 * the member ID from the file — and a page should not have to know that.
 */
export interface Owner extends OwnerData {
  /** Link to this person in Slack, when the workspace and their id are both known. */
  slackHref?: string;
}

export interface Update {
  date: Date;
  /** When the change lands, if that is not the day it was written. */
  effective?: Date;
  impact: ImpactLevel;
  stage: LifecycleStage;
  title: string;
  body?: string;
  /** What the reader has to do, when there is something. */
  actions?: string[];
  /** The streamline this update belongs to, for cross-streamline feeds. */
  streamline: Streamline;
}

/**
 * One of the written guides in `docs/`, rendered as a page.
 *
 * It carries no frontmatter, so its title and summary are read from the body —
 * the same `# ` heading and opening paragraph GitHub shows.
 */
export interface Doc {
  slug: string;
  title: string;
  summary: string;
  /** Minutes to read, shown in the title band. */
  minutes: number;
  href: string;
  editUrl: string;
  entry: CollectionEntry<'docs'>;
}

export interface Streamline {
  /** `team-slug/streamline-slug`, matching the content path. */
  id: string;
  slug: string;
  title: string;
  summary: string;
  team: Team;
  stage: LifecycleStage;
  category: Category;
  owners: Owner[];
  links: LinkData[];
  /** Stage id -> date, in lifecycle order, only stages that have a date. */
  timeline: Array<{ stage: LifecycleStage; date: Date }>;
  /**
   * The audience-by-audience rollout, in the order the author wrote it.
   * Always an array — a streamline that lands for everyone at once simply has
   * none, so no page has to branch on undefined.
   */
  phases: Phase[];
  /** Newest first. Populated after construction so updates can point back here. */
  updates: Update[];
  /** True when the streamline has reached a stage where it no longer changes. */
  isTerminal: boolean;
  href: string;
  editUrl: string;
  supersedesId?: string;
  /** The long prose under the timeline, as Markdown. Absent when there is none. */
  body?: string;
}

/** A file in the content repository, on whichever host it lives on. */
export function blobUrl(path: string): string {
  const { url: repo, branch } = siteConfig.repository;
  return `${repo.replace(/\/$/, '')}/blob/${branch}/${path}`;
}

/**
 * Profile page for an owner's handle, on whichever host the content repository
 * lives on — so this resolves to a GitHub Enterprise profile for an internal
 * instance rather than sending people to github.com.
 */
export function profileUrl(handle: string): string {
  try {
    return new URL(`/${handle}`, siteConfig.repository.url).href;
  } catch {
    return `https://github.com/${handle}`;
  }
}

/**
 * A member's Slack profile, given the workspace this site is configured for.
 *
 * Takes the workspace rather than reading it, matching `resolveDocHref` — the
 * config-dependent URL builders in this codebase are pure, so their branches
 * can be tested without standing up a different site.
 *
 * Returns undefined rather than guessing whenever the link cannot be built,
 * because a Slack link that lands nowhere is worse than a handle printed as
 * text: the reader has already spent the click.
 *
 * Enterprise Grid addresses a member under the org's own subdomain and at a
 * different path, with the id prefixed by an `@` that the workspace form does
 * not use. Both are Slack's own documented profile links.
 */
export function slackProfileUrl(
  memberId: string,
  workspaceUrl: string | undefined,
): string | undefined {
  if (!workspaceUrl) return undefined;

  try {
    const base = new URL(workspaceUrl);
    const path = base.hostname.endsWith('.enterprise.slack.com')
      ? `/user/@${memberId}`
      : `/team/${memberId}`;

    return new URL(path, base).href;
  } catch {
    return undefined;
  }
}

function buildOwner(owner: OwnerData): Owner {
  // Only a handle can carry the link, because the handle is what the page
  // shows. An id on its own has nothing to attach to; the validator says so.
  if (!owner.slack || !owner.slackId) return owner;

  const slackHref = slackProfileUrl(owner.slackId, siteConfig.slackWorkspaceUrl);
  return slackHref ? { ...owner, slackHref } : owner;
}

function buildTeam(entry: CollectionEntry<'teams'>): Team {
  const data = entry.data as TeamData;

  return {
    slug: entry.id,
    name: data.name,
    mission: data.mission,
    channel: data.channel,
    links: data.links ?? [],
    href: url(`/teams/${entry.id}`),
    editUrl: blobUrl(`content/teams/${entry.id}.yaml`),
  };
}

/** Placeholder for a team slug with no file, so a page renders instead of crashing. */
function missingTeam(slug: string): Team {
  return {
    slug,
    name: slug,
    mission: '',
    links: [],
    href: url(`/teams/${slug}`),
    editUrl: blobUrl(`content/teams/${slug}.yaml`),
  };
}

/**
 * The order the guides are offered in: the one for readers, then the one for
 * organizations adopting the site, then the one for people changing its code.
 *
 * This is a preference about reading order, not a registry. A guide that is not
 * named here still appears — after these, alphabetically — so dropping a file
 * into `docs/` is all it takes to publish it.
 */
const DOC_ORDER = ['using', 'adopting', 'developing'];

/**
 * A sparse stage -> date map from the file, resolved into stage objects
 * in lifecycle order. Shared by a streamline's own timeline and each of its
 * phases, so both orderings come from the same place.
 */
function resolveTimeline(raw: Record<string, Date | undefined> | undefined): TimelineEntry[] {
  if (!raw) return [];
  return siteConfig.lifecycle
    .filter((stage) => raw[stage.id] instanceof Date)
    .map((stage) => ({ stage, date: raw[stage.id] as Date }));
}

let cache: Promise<{ teams: Team[]; streamlines: Streamline[]; docs: Doc[] }> | null = null;

function buildDoc(entry: CollectionEntry<'docs'>): Doc {
  const body = entry.body ?? '';
  const path = `${DOCS_DIR}/${entry.id}.md`;

  return {
    slug: entry.id,
    title: docTitle(body, entry.id),
    summary: docSummary(body),
    minutes: readingMinutes(body),
    href: url(docRoute(entry.id)),
    editUrl: blobUrl(path),
    entry,
  };
}

async function load() {
  const [teamEntries, streamlineEntries, docEntries] = await Promise.all([
    getCollection('teams'),
    getCollection('streamlines'),
    getCollection('docs'),
  ]);

  const docs = docEntries.map(buildDoc).sort((a, b) => {
    const rank = (slug: string) => {
      const index = DOC_ORDER.indexOf(slug);
      return index === -1 ? DOC_ORDER.length : index;
    };
    return rank(a.slug) - rank(b.slug) || a.slug.localeCompare(b.slug);
  });

  const teams = teamEntries.map(buildTeam).sort((a, b) => a.name.localeCompare(b.name));
  const teamBySlug = new Map(teams.map((team) => [team.slug, team]));

  const streamlines = streamlineEntries.map((entry) => {
    const data = entry.data as StreamlineData;
    const [teamSlug = '', slug = ''] = entry.id.split('/');

    const timeline = resolveTimeline(data.timeline as Record<string, Date | undefined>);

    /*
     * `?? []` rather than trusting the schema default. The default only runs
     * when a file is parsed, and Astro caches parsed entries by file digest —
     * so a site that takes this feature from upstream without touching its
     * content has a warm cache full of entries that predate the `phases` key
     * and are never re-parsed. Reaching straight for `.map` there turns an
     * optional, backward-compatible addition into a crash on the first
     * `astro dev` after the merge, which is the one moment an adopter is least
     * able to diagnose it. Clearing the cache (`--force`) fixes the data; this
     * makes the fall back to "no phases" harmless in the meantime.
     */
    const phases: Phase[] = (data.phases ?? []).map((phase) => ({
      name: phase.name,
      audience: phase.audience,
      stage: getStage(phase.status),
      timeline: resolveTimeline(phase.timeline as Record<string, Date | undefined> | undefined),
    }));

    const streamline: Streamline = {
      id: entry.id,
      slug,
      title: data.title,
      summary: data.summary,
      team: teamBySlug.get(teamSlug) ?? missingTeam(teamSlug),
      stage: getStage(data.status),
      category: getCategory(data.category),
      owners: data.owners.map(buildOwner),
      links: data.links ?? [],
      timeline,
      phases,
      updates: [],
      isTerminal: isTerminalStage(data.status),
      href: url(`/streamlines/${entry.id}`),
      editUrl: blobUrl(`content/streamlines/${entry.id}.yaml`),
      supersedesId: data.supersedes,
      body: data.body,
    };

    // Newest first. Sorted here rather than required of authors, who append
    // updates wherever it is most natural in the file.
    streamline.updates = [...data.updates]
      .sort((a, b) => b.date.getTime() - a.date.getTime())
      .map((update) => ({
        date: update.date,
        effective: update.effective,
        impact: getImpact(update.impact),
        /*
         * An update is labelled with the stage the streamline was actually in
         * on the day it was written, worked out from the timeline. Falling
         * back to the current status would relabel years of history every time
         * a streamline advanced a stage. An explicit `status:` still wins, so
         * an author can correct a case the dates get wrong.
         */
        stage: update.status
          ? getStage(update.status)
          : (stageOn(timeline, update.date) ?? timeline[0]?.stage ?? getStage(data.status)),
        title: update.title,
        body: update.body,
        actions: update.actions,
        streamline,
      }));

    return streamline;
  });

  streamlines.sort((a, b) => a.title.localeCompare(b.title));

  return { teams, streamlines, docs };
}

function loadOnce() {
  cache ??= load();
  return cache;
}

export async function getTeams(): Promise<Team[]> {
  return (await loadOnce()).teams;
}

export async function getStreamlines(): Promise<Streamline[]> {
  return (await loadOnce()).streamlines;
}

/** The written guides, in reading order. */
export async function getDocs(): Promise<Doc[]> {
  return (await loadOnce()).docs;
}

export async function getTeam(slug: string): Promise<Team | undefined> {
  return (await getTeams()).find((team) => team.slug === slug);
}

export async function getStreamline(id: string): Promise<Streamline | undefined> {
  return (await getStreamlines()).find((streamline) => streamline.id === id);
}

export async function getStreamlinesForTeam(slug: string): Promise<Streamline[]> {
  return (await getStreamlines()).filter((streamline) => streamline.team.slug === slug);
}

/** The streamline this one replaces, if it names one. */
export async function getSuperseded(streamline: Streamline): Promise<Streamline | undefined> {
  if (!streamline.supersedesId) return undefined;
  return getStreamline(streamline.supersedesId);
}

/** The streamline that replaces this one, found by looking the other way. */
export async function getSupersededBy(streamline: Streamline): Promise<Streamline | undefined> {
  return (await getStreamlines()).find((other) => other.supersedesId === streamline.id);
}

/** Every update across every streamline, newest first. */
export async function getAllUpdates(): Promise<Update[]> {
  const streamlines = await getStreamlines();
  return streamlines
    .flatMap((streamline) => streamline.updates)
    .sort((a, b) => b.date.getTime() - a.date.getTime());
}
