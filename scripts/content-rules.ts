import { siteConfig } from '../site.config';
import { slugify, updateAnchor } from '../src/lib/anchor';
import { phaseStageIds } from '../src/lib/schema';
import type { StreamlineData, TeamData } from '../src/lib/schema';
import { loadStreamlines, loadTeams, repoRelative } from './load-content';
import type { Problem } from './load-content';

/**
 * Content rules that a schema cannot express.
 *
 * Zod checks each file on its own. These checks look across files — does that
 * team exist, does that superseded streamline exist, do these dates tell a
 * story that could actually have happened.
 *
 * Reading the files is load-content.ts's job; nothing here touches the disk.
 * Kept separate from the CLI entry point so the test suite can run the same
 * rules against fixtures.
 */

/** Re-exported: a problem is reported from here whoever first noticed it. */
export type { Problem };

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

/**
 * The impact levels that mean "this one breaks things", read from config
 * rather than from the id `breaking`, in the same spirit as the stages above:
 * whichever levels a fork weights heaviest are the ones it takes most
 * seriously, whatever they are called. With the shipped levels that is
 * Breaking alone.
 *
 * Used for one warning: a change at that weight with nothing under `body` and
 * nothing under `actions` tells a reader their work is about to break and then
 * leaves them with nowhere to go.
 */
const HEAVIEST_IMPACTS = (() => {
  const weights = siteConfig.impactLevels.map((impact) => impact.weight);
  if (weights.length === 0) return new Map<string, string>();

  const heaviest = Math.max(...weights);
  return new Map(
    siteConfig.impactLevels
      .filter((impact) => impact.weight === heaviest)
      .map((impact) => [impact.id, impact.label]),
  );
})();

/** Updates dated outside this window are almost always a typo in the year. */
const EARLIEST_SENSIBLE = new Date('2000-01-01T00:00:00Z');
const FUTURE_LIMIT_YEARS = 3;

/** An active streamline silent for this long is probably out of date. */
const STALE_AFTER_DAYS = 180;

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function validateContent(contentDir: string, repoRoot: string): ValidationResult {
  const errors: Problem[] = [];
  const warnings: Problem[] = [];

  const rel = (absolute: string) => repoRelative(absolute, repoRoot);

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

  const teams = loadTeams(contentDir, repoRoot);
  const teamsBySlug = new Map<string, TeamData>();

  for (const team of teams.entries) {
    errors.push(...team.problems);
    if (team.data) teamsBySlug.set(team.slug, team.data);
  }

  if (teams.entries.length === 0) {
    warnings.push({
      file: rel(teams.dir),
      message: 'No teams are defined yet. Add one file per team in content/teams/.',
    });
  }

  // ---------- Streamlines ----------

  const streamlines = loadStreamlines(contentDir, repoRoot);

  /** id -> file, for resolving `supersedes` once everything is loaded. */
  const streamlineIds = new Map<string, string>();
  const loaded: Array<{ file: string; id: string; data: StreamlineData }> = [];

  for (const entry of streamlines.entries) {
    const { file, teamSlug: dirSlug } = entry;

    // The directory is the source of truth for ownership; a mismatch means the
    // file was copied from another team and half-edited. Checked against the
    // raw value so it is reported even when the file has other problems —
    // otherwise the contributor fixes those, pushes, and only then learns
    // about this one.
    const rawTeam = entry.raw?.['team'];
    if (typeof rawTeam === 'string') {
      if (rawTeam !== dirSlug) {
        errors.push({
          file: rel(file),
          field: 'team',
          message: `This file is in content/streamlines/${dirSlug}/, so team must be "${dirSlug}", not "${rawTeam}". Move the file or fix the field.`,
        });
      } else if (!teamsBySlug.has(rawTeam)) {
        const known = [...teamsBySlug.keys()].sort().join(', ');
        errors.push({
          file: rel(file),
          field: 'team',
          message: `There is no team called "${rawTeam}". Add content/teams/${rawTeam}.yaml, or use one of: ${known || 'none defined yet'}.`,
        });
      }
    }

    if (!entry.data) {
      errors.push(...entry.problems);
      continue;
    }

    const data = entry.data;
    streamlineIds.set(entry.id, rel(file));
    loaded.push({ file, id: entry.id, data });

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

    // A streamline claiming a stage its own dates have already moved past.
    // A warning for the same reason the phase version below is: the dates may
    // be the plan and the status the truth of this morning, and failing a
    // build over that teaches people to leave the dates out. But `status` is
    // what the badge says on every card, on the roadmap and in the feed, while
    // the stepper on the streamline's own page is drawn from the timeline — so
    // one left behind puts the page in two minds about where the thing is.
    const overtakenBy = datedStages.find(
      (entry) =>
        entry.date.getTime() <= Date.now() &&
        STAGE_ORDER.indexOf(entry.stage) > STAGE_ORDER.indexOf(data.status),
    );

    if (overtakenBy) {
      warnings.push({
        file: rel(file),
        field: 'status',
        message: `This is marked ${STAGE_LABEL.get(data.status)}, but the timeline says it reached ${STAGE_LABEL.get(overtakenBy.stage)} on ${formatDate(overtakenBy.date)}. Move the status on, or correct the date.`,
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
    const seenPhaseSlugs = new Map<string, number>();

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

        // The same rule, one step further in. A phase has no id either, so
        // anything that refers to one from outside the page reduces its name
        // the way update anchors are reduced: lowercased, punctuation and
        // accents dropped. "Phase 1 — pilot" and "Phase 1 / pilot" are two
        // names to a reader and one name to everything else, and the second of
        // the two is the one that quietly stops existing.
        const slug = slugify(phase.name);
        const sameSlugAt = seenPhaseSlugs.get(slug);

        if (sameSlugAt === undefined) {
          seenPhaseSlugs.set(slug, index);
        } else {
          const reduced = slug ? ` ("${slug}")` : '';
          errors.push({
            file: rel(file),
            field: `phases[${index}].name`,
            message: `"${phase.name}" and "${data.phases[sameSlugAt]!.name}" are different names that reduce to the same one${reduced} once punctuation is dropped. Phase names have to differ in their words, not only in their punctuation.`,
          });
        }
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

    // An update has no author-supplied id, so it is identified by its date and
    // its title — that is what `updateAnchor` builds the fragment from, and
    // what `feeds.ts` turns into the `id` of the update's Atom entry. Two
    // updates that reduce to the same anchor therefore share one link on the
    // page and one identity in the feed, where a duplicate id leaves readers'
    // feed clients free to show one of the two and drop the other.
    //
    // Not only an exact repeat: the slug is cut at 48 characters, so two long
    // titles posted on the same day collide on their opening words alone.
    const seenAnchors = new Map<string, number>();

    data.updates.forEach((update, index) => {
      const anchor = updateAnchor(update);
      const sameAnchorAt = seenAnchors.get(anchor);

      if (sameAnchorAt === undefined) {
        seenAnchors.set(anchor, index);
      } else {
        errors.push({
          file: rel(file),
          field: `updates[${index}].title`,
          message: `This and updates[${sameAnchorAt}] are both dated ${formatDate(update.date)} and both come out as "#${anchor}", so they would share a single link on the page and a single entry in the feed. Give one of them a different title.`,
        });
      }

      if (update.date < EARLIEST_SENSIBLE || update.date > futureLimit) {
        errors.push({
          file: rel(file),
          field: `updates[${index}].date`,
          message: `${formatDate(update.date)} looks wrong — check the year.`,
        });
      }

      // A title alone can say what is happening, but at this weight it cannot
      // say what to do about it — and "Things will break if you do nothing" is
      // precisely the update a reader arrives at needing the next step. One or
      // the other is enough: `actions` if there is a list, a `body` if the
      // answer is prose.
      const heaviest = HEAVIEST_IMPACTS.get(update.impact);
      if (heaviest && !update.body && !update.actions?.length) {
        warnings.push({
          file: rel(file),
          field: `updates[${index}].actions`,
          message: `"${update.title}" is marked ${heaviest}, but says nothing about what to do about it. Add actions, or a body explaining it.`,
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
        message: `"${data.supersedes}" does not exist. Expected a file at content/streamlines/${data.supersedes}.yaml.`,
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

  // A streamline that will announce into thin air. The run works out what
  // changed, finds nowhere to send it, and drops it — which looks exactly like
  // a streamline that never changed.
  //
  // Only ever asked when no site-wide channel is set, because one of those
  // makes every streamline routable. If nothing anywhere names a channel the
  // warning goes against site.config.ts instead, on the same reasoning as the
  // one above: there is one fix, and a copy of it per streamline is not more
  // helpful, it is just longer.

  const announcements = siteConfig.announcements;

  if (announcements && !announcements.channel) {
    const homeless = loaded.filter(
      ({ data }) =>
        data.announce !== false &&
        !data.announceChannel &&
        !teamsBySlug.get(data.team)?.announceChannel,
    );

    const speaking = loaded.filter(({ data }) => data.announce !== false);

    if (homeless.length > 0 && homeless.length === speaking.length) {
      warnings.push({
        file: 'site.config.ts',
        field: 'announcements.channel',
        message: `Announcements are configured, but no channel is named anywhere — not here, not on a team, not on a streamline — so nothing would ever be sent. Set announcements.channel, or give each team an announceChannel.`,
      });
    } else {
      for (const { file, data } of homeless) {
        warnings.push({
          file: rel(file),
          field: 'announceChannel',
          message: `Announcements are configured, but nothing says where this one goes. Add announceChannel here, or to content/teams/${data.team}.yaml, or set announcements.channel in site.config.ts — otherwise its changes are worked out and then dropped.`,
        });
      }
    }
  }

  return {
    errors,
    warnings,
    counts: { teams: teamsBySlug.size, streamlines: loaded.length },
  };
}
