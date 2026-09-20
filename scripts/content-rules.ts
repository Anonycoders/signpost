import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

import matter from 'gray-matter';
import { load as loadYaml } from 'js-yaml';

import { siteConfig } from '../site.config';
import { phaseStageIds, streamlineSchema, teamSchema } from '../src/lib/schema';

/**
 * Content rules that a schema cannot express.
 *
 * Zod checks each file on its own. These checks look across files — does that
 * team exist, does that superseded streamline exist, do these dates tell a
 * story that could actually have happened.
 *
 * Kept separate from the CLI entry point so the test suite can run the same
 * rules against fixtures.
 */

export interface Problem {
  /** Repository-relative path, so the message can be pasted into an editor. */
  file: string;
  /** Frontmatter field the problem belongs to, if it maps to one. */
  field?: string;
  message: string;
}

export interface ValidationResult {
  errors: Problem[];
  warnings: Problem[];
  counts: { teams: number; streamlines: number };
}

const STAGE_ORDER = siteConfig.lifecycle.map((stage) => stage.id);
const STAGE_LABEL = new Map(siteConfig.lifecycle.map((stage) => [stage.id, stage.label]));

/**
 * The anti-surprise rule, read from config rather than from two stage names:
 * a streamline in a `windingDown` stage must carry a date for one of the
 * `terminal` stages. Rename "deprecated" and "retired" to whatever your
 * organization calls them and the rule follows.
 */
const WINDING_DOWN_STAGES = siteConfig.lifecycle.filter((stage) => stage.windingDown === true);
const TERMINAL_STAGES = siteConfig.lifecycle.filter((stage) => stage.terminal === true);

/** Updates dated outside this window are almost always a typo in the year. */
const EARLIEST_SENSIBLE = new Date('2000-01-01T00:00:00Z');
const FUTURE_LIMIT_YEARS = 3;

/** An active streamline silent for this long is probably out of date. */
const STALE_AFTER_DAYS = 180;

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function listFiles(dir: string, extensions: string[]): string[] {
  if (!existsSync(dir)) return [];

  return readdirSync(dir, { recursive: true, encoding: 'utf8' })
    .filter((entry) => extensions.some((ext) => entry.endsWith(ext)))
    .map((entry) => join(dir, entry))
    .sort();
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Turn a Zod issue path into a readable field name: `updates[0].impact`. */
function fieldPath(path: readonly PropertyKey[]): string {
  return path.reduce<string>((acc, segment) => {
    if (typeof segment === 'number') return `${acc}[${segment}]`;
    return acc ? `${acc}.${String(segment)}` : String(segment);
  }, '');
}

export function validateContent(contentDir: string, repoRoot: string): ValidationResult {
  const errors: Problem[] = [];
  const warnings: Problem[] = [];

  const rel = (absolute: string) => relative(repoRoot, absolute).split(sep).join('/');

  // ---------- Configuration ----------
  // Checked here rather than left to fail silently: a winding-down stage with
  // nothing to wind down to disables the anti-surprise rule entirely, and the
  // only symptom would be deprecations quietly passing validation.
  if (WINDING_DOWN_STAGES.length > 0 && TERMINAL_STAGES.length === 0) {
    const names = WINDING_DOWN_STAGES.map((stage) => `"${stage.id}"`).join(', ');
    errors.push({
      file: 'site.config.ts',
      field: 'lifecycle',
      message: `${names} is marked windingDown, but no stage is marked terminal, so there is no stage for it to point at. Mark the stage that means "switched off" with \`terminal: true\`.`,
    });
  }

  // ---------- Teams ----------

  const teamsDir = join(contentDir, 'teams');
  const teamFiles = listFiles(teamsDir, ['.yaml', '.yml']);
  const teamSlugs = new Set<string>();

  for (const file of teamFiles) {
    const slug = file
      .slice(teamsDir.length + 1)
      .replace(/\.(yaml|yml)$/, '')
      .split(sep)
      .join('/');

    if (!SLUG_PATTERN.test(slug)) {
      errors.push({
        file: rel(file),
        message: `"${slug}" is not a usable team slug. Name the file in lowercase-with-dashes, for example developer-experience.yaml.`,
      });
      continue;
    }

    let raw: unknown;
    try {
      raw = loadYaml(readFileSync(file, 'utf8'));
    } catch (error) {
      errors.push({
        file: rel(file),
        message: `This file is not valid YAML. ${(error as Error).message}`,
      });
      continue;
    }

    const parsed = teamSchema.safeParse(raw);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        errors.push({
          file: rel(file),
          field: fieldPath(issue.path) || undefined,
          message: issue.message,
        });
      }
      continue;
    }

    teamSlugs.add(slug);
  }

  if (teamFiles.length === 0) {
    warnings.push({
      file: rel(teamsDir),
      message: 'No teams are defined yet. Add one file per team in content/teams/.',
    });
  }

  // ---------- Streamlines ----------

  const streamlinesDir = join(contentDir, 'streamlines');
  const streamlineFiles = listFiles(streamlinesDir, ['.md']);

  /** id -> file, for resolving `supersedes` once everything is loaded. */
  const streamlineIds = new Map<string, string>();
  const loaded: Array<{ file: string; id: string; data: ReturnType<typeof streamlineSchema.parse> }> =
    [];

  for (const file of streamlineFiles) {
    const relativeId = file
      .slice(streamlinesDir.length + 1)
      .replace(/\.md$/, '')
      .split(sep)
      .join('/');

    const segments = relativeId.split('/');

    if (segments.length !== 2) {
      errors.push({
        file: rel(file),
        message:
          'Streamlines live one directory deep, as content/streamlines/<team-slug>/<streamline-slug>.md.',
      });
      continue;
    }

    const [dirSlug, streamlineSlug] = segments as [string, string];

    if (!SLUG_PATTERN.test(streamlineSlug)) {
      errors.push({
        file: rel(file),
        message: `"${streamlineSlug}" is not a usable slug. Name the file in lowercase-with-dashes.`,
      });
      continue;
    }

    let parsedFile: matter.GrayMatterFile<string>;
    try {
      parsedFile = matter(readFileSync(file, 'utf8'));
    } catch (error) {
      errors.push({
        file: rel(file),
        message: `The frontmatter block is not valid YAML. ${(error as Error).message}`,
      });
      continue;
    }

    // The directory is the source of truth for ownership; a mismatch means the
    // file was copied from another team and half-edited. Checked against the
    // raw value so it is reported even when the file has other problems —
    // otherwise the contributor fixes those, pushes, and only then learns
    // about this one.
    const rawTeam = (parsedFile.data as Record<string, unknown>)['team'];
    if (typeof rawTeam === 'string') {
      if (rawTeam !== dirSlug) {
        errors.push({
          file: rel(file),
          field: 'team',
          message: `This file is in content/streamlines/${dirSlug}/, so team must be "${dirSlug}", not "${rawTeam}". Move the file or fix the field.`,
        });
      } else if (!teamSlugs.has(rawTeam)) {
        const known = [...teamSlugs].sort().join(', ');
        errors.push({
          file: rel(file),
          field: 'team',
          message: `There is no team called "${rawTeam}". Add content/teams/${rawTeam}.yaml, or use one of: ${known || 'none defined yet'}.`,
        });
      }
    }

    const parsed = streamlineSchema.safeParse(parsedFile.data);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        errors.push({
          file: rel(file),
          field: fieldPath(issue.path) || undefined,
          message: issue.message,
        });
      }
      continue;
    }

    const data = parsed.data;
    streamlineIds.set(relativeId, rel(file));
    loaded.push({ file, id: relativeId, data });

    // ---------- Owners ----------
    //
    // The member ID is machinery: it never appears on the page, and its only
    // job is to make the handle clickable. Without a handle to attach to it
    // does nothing at all, silently — which is the kind of quiet nothing an
    // author discovers months later, if ever.

    data.owners.forEach((owner, index) => {
      if (owner.slackId && !owner.slack) {
        warnings.push({
          file: rel(file),
          field: `owners[${index}].slackId`,
          message: `${owner.name} has a slack member ID but no slack handle, so nothing is shown and nothing links. Add the handle, or drop the id.`,
        });
      }
    });

    // ---------- Timeline coherence ----------

    const timeline = data.timeline as Record<string, Date | undefined>;
    const datedStages = STAGE_ORDER.filter((stage) => timeline[stage] instanceof Date).map(
      (stage) => ({ stage, date: timeline[stage] as Date }),
    );

    for (let i = 1; i < datedStages.length; i += 1) {
      const previous = datedStages[i - 1]!;
      const current = datedStages[i]!;

      if (current.date.getTime() < previous.date.getTime()) {
        errors.push({
          file: rel(file),
          field: 'timeline',
          message: `${STAGE_LABEL.get(current.stage)} (${formatDate(current.date)}) is dated before ${STAGE_LABEL.get(previous.stage)} (${formatDate(previous.date)}), but it comes later in the lifecycle. Check the dates.`,
        });
      }
    }

    if (datedStages.length === 0) {
      errors.push({
        file: rel(file),
        field: 'timeline',
        message:
          'The timeline is empty. Give at least the date this reached its current status, so it can be placed on the roadmap.',
      });
    } else if (!(timeline[data.status] instanceof Date)) {
      errors.push({
        file: rel(file),
        field: 'timeline',
        message: `status is "${data.status}" but the timeline has no ${data.status} date. Add one so the roadmap knows when this happened.`,
      });
    }

    const windingDown = WINDING_DOWN_STAGES.find((stage) => stage.id === data.status);
    const endStage = TERMINAL_STAGES[0];

    if (
      windingDown &&
      endStage &&
      !TERMINAL_STAGES.some((stage) => timeline[stage.id] instanceof Date)
    ) {
      // Stage labels read as participles ("Retired", "Archived"), so this stays
      // grammatical whatever an organization calls the end of its lifecycle.
      errors.push({
        file: rel(file),
        field: 'timeline',
        message: `A ${windingDown.label.toLowerCase()} streamline must say when it will be ${endStage.label.toLowerCase()}. Add a \`${endStage.id}\` date to the timeline so the teams depending on it know their deadline.`,
      });
    }

    // ---------- Rollout phases ----------
    //
    // No rule compares one phase with another. Overlapping phases are the
    // normal case — a pilot is still bedding in while the next wave starts —
    // and a site that called that an error would be wrong about how rollouts
    // actually run. Each phase is only checked against itself.

    const seenPhaseNames = new Map<string, number>();

    data.phases.forEach((phase, index) => {
      const key = phase.name.trim().toLowerCase();
      const firstAt = seenPhaseNames.get(key);

      if (firstAt !== undefined) {
        errors.push({
          file: rel(file),
          field: `phases[${index}].name`,
          message: `Two phases are both called "${phase.name}". Phase names have to be unique within a streamline so a reader can tell which wave they are in.`,
        });
      } else {
        seenPhaseNames.set(key, index);
      }

      const phaseTimeline = (phase.timeline ?? {}) as Record<string, Date | undefined>;
      const dated = STAGE_ORDER.filter((stage) => phaseTimeline[stage] instanceof Date).map(
        (stage) => ({ stage, date: phaseTimeline[stage] as Date }),
      );

      for (let i = 1; i < dated.length; i += 1) {
        const previous = dated[i - 1]!;
        const current = dated[i]!;

        if (current.date.getTime() < previous.date.getTime()) {
          errors.push({
            file: rel(file),
            field: `phases[${index}].timeline`,
            message: `In "${phase.name}", ${STAGE_LABEL.get(current.stage)} (${formatDate(current.date)}) is dated before ${STAGE_LABEL.get(previous.stage)} (${formatDate(previous.date)}), but it comes later in the lifecycle. Check the dates.`,
          });
        }
      }

      // A phase claiming a state its own dates do not support. A warning, not
      // an error: the dates may simply be the plan and the status the truth of
      // this morning, and blocking a merge over that would teach people to
      // leave the dates out.
      const statusLabel = STAGE_LABEL.get(phase.status) ?? phase.status;
      const statusDate = phaseTimeline[phase.status];
      const now = Date.now();

      if (statusDate instanceof Date && statusDate.getTime() > now) {
        warnings.push({
          file: rel(file),
          field: `phases[${index}].status`,
          message: `"${phase.name}" is marked ${statusLabel}, but its ${statusLabel} date is ${formatDate(statusDate)}, which has not happened yet. Either the status is early or the date is.`,
        });
      }

      const overtaken = dated.find(
        (entry) =>
          entry.date.getTime() <= now &&
          STAGE_ORDER.indexOf(entry.stage) > STAGE_ORDER.indexOf(phase.status),
      );

      if (overtaken) {
        warnings.push({
          file: rel(file),
          field: `phases[${index}].status`,
          message: `"${phase.name}" is marked ${statusLabel}, but it reached ${STAGE_LABEL.get(overtaken.stage)} on ${formatDate(overtaken.date)}. Move the status on, or correct the date.`,
        });
      }
    });

    // ---------- The streamline against its own phases ----------
    //
    // Different question from the one above, and the reason it is worth asking:
    // the page draws the stepper and the phase rows inside a single card, so a
    // streamline whose own dates stop before its last phase does — or whose
    // status has run ahead of every audience — renders as one box contradicting
    // itself, and the author is the last person to notice.
    //
    // Only in that direction. A phase ahead of its streamline is the design:
    // the pilot team is generally available while the thing as a whole is still
    // rolling out. That is the entire point of phases and never a warning.

    if (data.phases.length > 0) {
      const lastDated = datedStages[datedStages.length - 1];

      let latestPhase: { name: string; date: Date } | undefined;

      for (const phase of data.phases) {
        const phaseTimeline = (phase.timeline ?? {}) as Record<string, Date | undefined>;

        for (const stage of STAGE_ORDER) {
          const date = phaseTimeline[stage];
          if (!(date instanceof Date)) continue;
          if (!latestPhase || date.getTime() > latestPhase.date.getTime()) {
            latestPhase = { name: phase.name, date };
          }
        }
      }

      if (lastDated && latestPhase && latestPhase.date.getTime() > lastDated.date.getTime()) {
        warnings.push({
          file: rel(file),
          field: 'timeline',
          message: `The timeline ends on ${formatDate(lastDated.date)}, but "${latestPhase.name}" runs to ${formatDate(latestPhase.date)} — the streamline finishes before its own rollout does. Extend the timeline, or correct the phase date.`,
        });
      }

      // Skipped once a streamline is winding down: it is then past every stage
      // a phase is allowed to be in, and there is nothing inconsistent in that.
      const statusIndex = phaseStageIds.indexOf(data.status);
      const furthest = data.phases.reduce(
        (best, phase) => Math.max(best, phaseStageIds.indexOf(phase.status)),
        -1,
      );

      if (statusIndex > -1 && furthest > -1 && statusIndex > furthest) {
        const reached = STAGE_LABEL.get(phaseStageIds[furthest]!) ?? phaseStageIds[furthest]!;
        warnings.push({
          file: rel(file),
          field: 'status',
          message: `This is marked ${STAGE_LABEL.get(data.status)}, but no phase has got past ${reached} — by its own phases, no audience is there yet. Move a phase on, or take the status back.`,
        });
      }
    }

    // ---------- Updates ----------

    const futureLimit = new Date();
    futureLimit.setUTCFullYear(futureLimit.getUTCFullYear() + FUTURE_LIMIT_YEARS);

    data.updates.forEach((update, index) => {
      if (update.date < EARLIEST_SENSIBLE || update.date > futureLimit) {
        errors.push({
          file: rel(file),
          field: `updates[${index}].date`,
          message: `${formatDate(update.date)} looks wrong — check the year.`,
        });
      }

      if (!update.effective) return;

      if (update.effective < EARLIEST_SENSIBLE || update.effective > futureLimit) {
        errors.push({
          file: rel(file),
          field: `updates[${index}].effective`,
          message: `${formatDate(update.effective)} looks wrong — check the year.`,
        });
        return;
      }

      // `effective` exists to push an announcement forward to the day it
      // lands. Pointing it at or before the posting date does nothing visible
      // except file the update in the past, which is the opposite of why
      // anyone would add the field.
      if (update.effective <= update.date) {
        errors.push({
          file: rel(file),
          field: `updates[${index}].effective`,
          message: `effective (${formatDate(update.effective)}) is not after date (${formatDate(update.date)}). Use effective only when a change lands later than the day you are posting about it; if they are the same day, remove it.`,
        });
      }
    });

    // ---------- Staleness (warning only) ----------

    const stage = siteConfig.lifecycle.find((s) => s.id === data.status);
    const isActive = stage != null && stage.terminal !== true;
    const latestUpdate = data.updates.reduce<Date | null>(
      (latest, update) => (latest == null || update.date > latest ? update.date : latest),
      null,
    );

    if (isActive && latestUpdate != null) {
      const daysSince = Math.floor((Date.now() - latestUpdate.getTime()) / 86_400_000);
      if (daysSince > STALE_AFTER_DAYS) {
        warnings.push({
          file: rel(file),
          message: `No update in ${daysSince} days, but this is still marked "${STAGE_LABEL.get(data.status)}". Post an update, or change the status if it has moved on.`,
        });
      }
    }
  }

  // ---------- Cross-references ----------

  for (const { file, id, data } of loaded) {
    if (!data.supersedes) continue;

    if (data.supersedes === id) {
      errors.push({
        file: rel(file),
        field: 'supersedes',
        message: 'A streamline cannot supersede itself.',
      });
      continue;
    }

    if (!streamlineIds.has(data.supersedes)) {
      errors.push({
        file: rel(file),
        field: 'supersedes',
        message: `"${data.supersedes}" does not exist. Expected a file at content/streamlines/${data.supersedes}.md.`,
      });
    }
  }

  // ---------- Content against configuration ----------
  //
  // A member ID is only ever half an address: it says who, and site.config
  // says where. Someone who has gone to the trouble of copying IDs out of
  // Slack has done the tedious half and would otherwise get nothing for it,
  // with no error and no clue — the handles would simply render as text.
  //
  // Reported once, against the file that has to change, rather than once per
  // streamline: there is one fix, and thirteen copies of it is not thirteen
  // times as helpful.

  if (!siteConfig.slackWorkspaceUrl) {
    const withIds = loaded.filter(({ data }) => data.owners.some((owner) => owner.slackId));

    if (withIds.length > 0) {
      const where =
        withIds.length === 1
          ? rel(withIds[0]!.file)
          : `${withIds.length} streamlines, starting with ${rel(withIds[0]!.file)}`;

      warnings.push({
        file: 'site.config.ts',
        field: 'slackWorkspaceUrl',
        message: `Owners carry a slackId in ${where}, but no Slack workspace is configured, so their handles will not link. Set slackWorkspaceUrl in site.config.ts, or drop the ids.`,
      });
    }
  }

  return {
    errors,
    warnings,
    counts: { teams: teamSlugs.size, streamlines: loaded.length },
  };
}
