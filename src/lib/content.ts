import { getCollection, type CollectionEntry } from 'astro:content';

import { siteConfig, type Category, type ImpactLevel, type LifecycleStage } from '@config';
import type { LinkData, OwnerData, StreamlineData, TeamData } from './schema';
import { getCategory, getImpact, getStage, isTerminalStage } from './taxonomy';
import { url } from './url';

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

export interface Update {
  date: Date;
  impact: ImpactLevel;
  stage: LifecycleStage;
  title: string;
  body?: string;
  /** The streamline this update belongs to, for cross-streamline feeds. */
  streamline: Streamline;
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
  owners: OwnerData[];
  links: LinkData[];
  /** Stage id -> date, in lifecycle order, only stages that have a date. */
  timeline: Array<{ stage: LifecycleStage; date: Date }>;
  /** Newest first. Populated after construction so updates can point back here. */
  updates: Update[];
  /** True when the streamline has reached a stage where it no longer changes. */
  isTerminal: boolean;
  href: string;
  editUrl: string;
  supersedesId?: string;
  entry: CollectionEntry<'streamlines'>;
}

function blobUrl(path: string): string {
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

let cache: Promise<{ teams: Team[]; streamlines: Streamline[] }> | null = null;

async function load() {
  const [teamEntries, streamlineEntries] = await Promise.all([
    getCollection('teams'),
    getCollection('streamlines'),
  ]);

  const teams = teamEntries.map(buildTeam).sort((a, b) => a.name.localeCompare(b.name));
  const teamBySlug = new Map(teams.map((team) => [team.slug, team]));

  const streamlines = streamlineEntries.map((entry) => {
    const data = entry.data as StreamlineData;
    const [teamSlug = '', slug = ''] = entry.id.split('/');
    const timelineData = data.timeline as Record<string, Date | undefined>;

    const streamline: Streamline = {
      id: entry.id,
      slug,
      title: data.title,
      summary: data.summary,
      team: teamBySlug.get(teamSlug) ?? missingTeam(teamSlug),
      stage: getStage(data.status),
      category: getCategory(data.category),
      owners: data.owners,
      links: data.links ?? [],
      timeline: siteConfig.lifecycle
        .filter((stage) => timelineData[stage.id] instanceof Date)
        .map((stage) => ({ stage, date: timelineData[stage.id] as Date })),
      updates: [],
      isTerminal: isTerminalStage(data.status),
      href: url(`/streamlines/${entry.id}`),
      editUrl: blobUrl(`content/streamlines/${entry.id}.md`),
      supersedesId: data.supersedes,
      entry,
    };

    // Newest first. Sorted here rather than required of authors, who append
    // updates wherever it is most natural in the file.
    streamline.updates = [...data.updates]
      .sort((a, b) => b.date.getTime() - a.date.getTime())
      .map((update) => ({
        date: update.date,
        impact: getImpact(update.impact),
        stage: getStage(update.status ?? data.status),
        title: update.title,
        body: update.body,
        streamline,
      }));

    return streamline;
  });

  streamlines.sort((a, b) => a.title.localeCompare(b.title));

  return { teams, streamlines };
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
