import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

import { load as loadYaml } from 'js-yaml';
import { z } from 'zod';

import { streamlineSchema, teamSchema } from '../src/lib/schema';
import type { StreamlineData, TeamData } from '../src/lib/schema';

/**
 * Reading `content/` from Node, outside Astro.
 *
 * The site loads content through `astro:content`, which a plain script cannot
 * import. Everything run by `tsx` — the validator today, anything that needs
 * the content without building the site tomorrow — has to walk the directory
 * and parse the files itself, and this is the one place that does.
 *
 * One place on purpose, and not for tidiness. A streamline's id is derived from
 * where its file sits, and that id is what the site puts in URLs and what
 * anything outside the site uses to mean "this one". A second derivation that
 * drifted by a character would quietly produce two ids for one streamline, with
 * nothing anywhere to notice.
 *
 * Nothing here judges content. It reports only what stopped a file from being
 * read — its path, its YAML, its shape — and leaves every question of whether
 * the content makes sense to the rules in content-rules.ts.
 */

export interface Problem {
  /** Repository-relative path, so the message can be pasted into an editor. */
  file: string;
  /** The field the problem belongs to, if it maps to one. */
  field?: string;
  message: string;
}

/** A path as it should be printed to someone: relative, forward slashes. */
export function repoRelative(absolute: string, repoRoot: string): string {
  return relative(repoRoot, absolute).split(sep).join('/');
}

export interface TeamEntry {
  file: string;
  slug: string;
  /** Absent when the file could not be read, or the schema rejected it. */
  data?: TeamData;
  /** What stopped it, in the order it was found. Empty when `data` is set. */
  problems: Problem[];
}

export interface StreamlineEntry {
  file: string;
  /** `<team-slug>/<streamline-slug>`: the id the whole site knows it by. */
  id: string;
  /** The directory it sits in, which is the source of truth for ownership. */
  teamSlug: string;
  slug: string;
  /**
   * The document as YAML gave it, before the schema saw it. Present as soon as
   * the file parses, so a caller can cross-check a single field on a file the
   * schema has otherwise rejected.
   */
  raw?: Record<string, unknown>;
  /** Absent when the file could not be read, or the schema rejected it. */
  data?: StreamlineData;
  /** What stopped it, in the order it was found. Empty when `data` is set. */
  problems: Problem[];
}

export interface Load<Entry> {
  /** The directory that was walked, whether or not it exists. */
  dir: string;
  /** One per file found, in path order, readable or not. */
  entries: Entry[];
}

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const YAML_EXTENSIONS = ['.yaml', '.yml'];
const YAML_EXTENSION = /\.ya?ml$/;

function listFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];

  return readdirSync(dir, { recursive: true, encoding: 'utf8' })
    .filter((entry) => YAML_EXTENSIONS.some((ext) => entry.endsWith(ext)))
    .map((entry) => join(dir, entry))
    .sort();
}

/** Turn a Zod issue path into a readable field name: `updates[0].impact`. */
function fieldPath(path: readonly PropertyKey[]): string {
  return path.reduce<string>((acc, segment) => {
    if (typeof segment === 'number') return `${acc}[${segment}]`;
    return acc ? `${acc}.${String(segment)}` : String(segment);
  }, '');
}

/** The part of a path under `dir`, without its extension, as an id. */
function idUnder(file: string, dir: string): string {
  return file
    .slice(dir.length + 1)
    .replace(YAML_EXTENSION, '')
    .split(sep)
    .join('/');
}

interface Parsed<Data> {
  /** What YAML made of the file. Absent only when the YAML itself failed. */
  raw?: Record<string, unknown>;
  /** Absent when anything at all stopped the file from being read. */
  data?: Data;
  problems: Problem[];
}

/**
 * Read one file and parse it against its schema.
 *
 * Shared by both loaders because since content became YAML they do exactly the
 * same thing here — a team file and a streamline file differ in their schema
 * and in nothing else. Two copies would be two chances for the same mistake in
 * the two halves of `content/` to be reported in different words.
 */
function parseFile<Data>(file: string, at: string, schema: z.ZodType<Data>): Parsed<Data> {
  let raw: unknown;
  try {
    raw = loadYaml(readFileSync(file, 'utf8'));
  } catch (error) {
    return {
      problems: [{ file: at, message: `This file is not valid YAML. ${(error as Error).message}` }],
    };
  }

  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return {
      raw: raw as Record<string, unknown>,
      problems: parsed.error.issues.map((issue) => ({
        file: at,
        field: fieldPath(issue.path) || undefined,
        message: issue.message,
      })),
    };
  }

  return { raw: raw as Record<string, unknown>, data: parsed.data, problems: [] };
}

export function loadTeams(contentDir: string, repoRoot: string): Load<TeamEntry> {
  const dir = join(contentDir, 'teams');
  const entries: TeamEntry[] = [];

  for (const file of listFiles(dir)) {
    const slug = idUnder(file, dir);
    const at = repoRelative(file, repoRoot);
    const entry: TeamEntry = { file, slug, problems: [] };
    entries.push(entry);

    if (!SLUG_PATTERN.test(slug)) {
      entry.problems.push({
        file: at,
        message: `"${slug}" is not a usable team slug. Name the file in lowercase-with-dashes, for example developer-experience.yaml.`,
      });
      continue;
    }

    const parsed = parseFile(file, at, teamSchema);
    entry.problems.push(...parsed.problems);
    entry.data = parsed.data;
  }

  return { dir, entries };
}

export function loadStreamlines(contentDir: string, repoRoot: string): Load<StreamlineEntry> {
  const dir = join(contentDir, 'streamlines');
  const entries: StreamlineEntry[] = [];

  for (const file of listFiles(dir)) {
    const id = idUnder(file, dir);
    const segments = id.split('/');
    const at = repoRelative(file, repoRoot);

    const [teamSlug = '', slug = ''] = segments as [string?, string?];
    const entry: StreamlineEntry = { file, id, teamSlug, slug, problems: [] };
    entries.push(entry);

    if (segments.length !== 2) {
      entry.problems.push({
        file: at,
        message:
          'Streamlines live one directory deep, as content/streamlines/<team-slug>/<streamline-slug>.yaml.',
      });
      continue;
    }

    if (!SLUG_PATTERN.test(slug)) {
      entry.problems.push({
        file: at,
        message: `"${slug}" is not a usable slug. Name the file in lowercase-with-dashes.`,
      });
      continue;
    }

    const parsed = parseFile(file, at, streamlineSchema);
    entry.raw = parsed.raw;
    entry.problems.push(...parsed.problems);
    entry.data = parsed.data;
  }

  return { dir, entries };
}
