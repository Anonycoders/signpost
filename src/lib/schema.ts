import { z } from 'zod';
import { siteConfig } from '../../site.config';

/**
 * Content schemas.
 *
 * Shared deliberately: Astro validates collections with these at build time,
 * and `scripts/validate-content.ts` reuses them so a contributor gets the same
 * answer from CI as from their editor. Changing a rule here changes it once.
 *
 * Three audiences read this file, which is why nearly every field carries both
 * a comment and a `.describe()`. The comment is for whoever is changing the
 * rule; the description is what `scripts/json-schema.ts` puts in front of a
 * contributor as they hover the field in their editor, so it is written for
 * someone filling the field in, not for someone maintaining it.
 */

const stageIds = siteConfig.lifecycle.map((stage) => stage.id);
const categoryIds = siteConfig.categories.map((category) => category.id);
const impactIds = siteConfig.impactLevels.map((impact) => impact.id);

function enumOf(values: string[], hint: string) {
  return z.enum(values as [string, ...string[]], {
    error: `${hint} Must be one of: ${values.join(', ')}.`,
  });
}

/** Parse YYYY-MM-DD strictly, rejecting impossible days like 2026-02-30. */
function parseIsoDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;

  const [, year, month, day] = match.map(Number) as [number, number, number, number];
  const date = new Date(Date.UTC(year, month - 1, day));

  const roundTrips =
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day;

  return roundTrips ? date : null;
}

/**
 * A calendar date.
 *
 * YAML turns an unquoted `2026-01-15` into a Date already, so both forms are
 * accepted. Everything is normalised to UTC midnight; dates are formatted in
 * UTC throughout the site so a reader in any timezone sees the day the author
 * wrote, not one shifted by their offset.
 *
 * The `id` is not decoration. JSON Schema has no date type and no idea that
 * these two branches are the same thing, so `scripts/json-schema.ts` looks for
 * this id and emits one `YYYY-MM-DD` string in place of the union — which is
 * what an author actually types, in either form.
 */
export const dateSchema = z
  .union([z.date(), z.string()])
  .meta({ id: 'calendar-date' })
  .transform((value, ctx) => {
    if (value instanceof Date) {
      if (Number.isNaN(value.getTime())) {
        ctx.addIssue({ code: 'custom', message: 'is not a real calendar date' });
        return z.NEVER;
      }
      return value;
    }

    const parsed = parseIsoDate(value);
    if (!parsed) {
      ctx.addIssue({
        code: 'custom',
        message: `"${value}" is not a real date. Write dates as YYYY-MM-DD, for example 2026-03-01.`,
      });
      return z.NEVER;
    }
    return parsed;
  });

/**
 * Stage -> date, as a sparse map over the configured lifecycle. Stages may be
 * skipped; unknown stage names are rejected. Used for a streamline's own
 * timeline and, in the same shape, for each rollout phase's.
 */
function timelineSchema() {
  return z.strictObject(
    Object.fromEntries(stageIds.map((id) => [id, dateSchema.optional()])) as Record<
      string,
      z.ZodOptional<typeof dateSchema>
    >,
  );
}

/**
 * The stages a rollout phase may be in.
 *
 * Phases progress; products deprecate. An audience is never "deprecated" — the
 * thing being rolled out to it is, and that belongs to the streamline as a
 * whole. Derived from the lifecycle so a fork that renames its stages, or adds
 * one, gets the right list without editing this file.
 */
export const phaseStageIds = siteConfig.lifecycle
  .filter((stage) => stage.windingDown !== true && stage.terminal !== true)
  .map((stage) => stage.id);

const PHASE_AUDIENCE_REQUIRED =
  'A phase needs an audience — say who gets it in this phase, for example "Pilot teams" or "Everyone".';

const phaseSchema = z.object({
  name: z
    .string({ error: 'A phase needs a name.' })
    .min(1, { error: 'A phase needs a name.' })
    .max(60, { error: 'Keep phase names under 60 characters — they sit in a narrow column.' })
    .describe('What this phase is called, for example "Phase 1 — pilot". Under 60 characters.'),
  audience: z
    .string({ error: PHASE_AUDIENCE_REQUIRED })
    .min(1, { error: PHASE_AUDIENCE_REQUIRED })
    .max(120, { error: 'Keep the audience to a short phrase, under 120 characters.' })
    .describe('Who gets it in this phase, for example "Pilot teams" or "Everyone".'),
  status: enumOf(
    phaseStageIds,
    'A phase moves through the rollout, so its status cannot be a winding-down or terminal stage.',
  ).describe('Where this phase is today. A phase rolls out; it never deprecates.'),
  timeline: timelineSchema()
    .optional()
    .describe("This phase's own dates. Optional — a phase may be named before it is planned."),
});

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * A chat channel to post into: `#platform-news`, or the channel ID Slack shows
 * under **View channel details**, `C0123ABCD`.
 *
 * Checked rather than taken as free text because there is no second chance to
 * notice a typo. A wrong channel fails at the moment of posting, inside a
 * scheduled job nobody is watching, with an announcement that simply never
 * arrives — which is the failure this whole feature exists to prevent.
 */
const channelSchema = z
  .string()
  .regex(/^(#[a-z0-9][a-z0-9._-]{0,79}|[CGD][A-Z0-9]{6,20})$/, {
    error:
      'A channel is either its name with the # (#platform-news) or its ID (C0123ABCD). A bare name will not resolve.',
  })
  .describe(
    'A Slack channel to post into: #platform-news, or the channel ID from View channel details, C0123ABCD. A bare name without the # will not resolve.',
  );

const linkSchema = z.object({
  label: z
    .string()
    .min(1, { error: 'A link needs a label.' })
    .describe('What the link says on the page, for example "Migration guide".'),
  url: z
    .url({ error: 'A link needs a full URL, starting with http:// or https://.' })
    .describe('The full URL, starting with http:// or https://.'),
});

const ownerSchema = z.object({
  name: z
    .string()
    .min(1, { error: 'An owner needs a name.' })
    .describe('The person’s name, as colleagues would say it. The only required field.'),
  github: z
    .string()
    .regex(/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/, {
      error: 'A github handle is the username only, without the @ or a URL.',
    })
    .optional()
    .describe('Username on your GitHub or GitHub Enterprise instance, without the @ or a URL.'),
  email: z
    .email({ error: 'That does not look like an email address.' })
    .optional()
    .describe('An address a reader can write to.'),
  /**
   * Slack handle, for organizations that live in chat rather than in email.
   *
   * This is the readable half: what a colleague would type to find this
   * person. It is what the page prints, and on its own it is printed as plain
   * text, because Slack has no URL that resolves a handle — display names are
   * not unique and are not addressable. `slackId` is the half that links.
   */
  slack: z
    .string()
    .regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/, {
      error: 'A slack handle is the handle only, without the @ or a URL.',
    })
    .optional()
    .describe(
      'Slack handle, without the @ or a URL. This is what the page shows. On its own it is plain text — add slackId to make it a link.',
    ),
  /**
   * Slack member ID — `U024BE7LH`, or `W…` on Enterprise Grid. In Slack:
   * open the member's profile, then **More → Copy member ID**.
   *
   * The only identifier Slack will resolve, which is why it exists as a field
   * of its own: with it, and a `slackWorkspaceUrl` in site.config.ts, the
   * handle above becomes a link to that person's profile. Nobody has to read
   * the ID — it never appears on the page.
   */
  slackId: z
    .string()
    .regex(/^[UW][A-Z0-9]{6,20}$/, {
      error:
        'A slack member ID looks like U024BE7LH. Find it on the member’s Slack profile under More → Copy member ID — it is not the handle.',
    })
    .optional()
    .describe(
      'Slack member ID, U024BE7LH. In Slack: open the profile, then More → Copy member ID. It never appears on the page — it is what turns the handle into a link.',
    ),
});

export const teamSchema = z.object({
  name: z
    .string()
    .min(1, { error: 'A team needs a name.' })
    .describe('The team name as the organization says it, for example "DevOps".'),
  mission: z
    .string()
    .min(10, { error: 'Write a sentence saying what this team owns.' })
    .max(300, { error: 'Keep the mission to a sentence or two (300 characters).' })
    .describe('A sentence or two saying what this team owns. Shown on the team page.'),
  channel: z
    .string()
    .optional()
    .describe(
      'Where to reach the team — a chat channel, a mailing list, whatever people actually use. Printed on the team page for a human to read.',
    ),
  /**
   * Where this team's changes are announced, if the site is configured to
   * announce at all. Falls back to the site-wide channel when absent.
   *
   * A different field from `channel` above, and deliberately so. `channel` is
   * inbound: where a reader goes to ask this team something, printed on the
   * team's page for a human to read. This one is outbound and is read by a
   * machine — usually a channel the people who depend on this team are in,
   * which is rarely the channel the team itself works in.
   */
  announceChannel: channelSchema
    .optional()
    .describe(
      "Where this team's changes are announced, if the site announces at all. Outbound, and read by a machine — usually a channel the teams who depend on this one are in, not the channel this team works in. Falls back to the site-wide channel.",
    ),
  links: z
    .array(linkSchema)
    .optional()
    .describe('Runbooks, dashboards, docs — anything a reader of the team page should have.'),
});

const updateSchema = z.object({
  date: dateSchema.describe(
    'The day you are posting this. Updates appear on the streamline page in this order.',
  ),
  /**
   * The changes page files an update under this date, so a warning stays in
   * "Still to come" until the thing it warns about has happened, rather than
   * sliding into the past the week after it was posted.
   */
  effective: dateSchema
    .optional()
    .describe(
      'The day the change lands on other people, when that is not the day you posted it. A deprecation announced in September that takes effect in November is date: 2026-09-10, effective: 2026-11-02. Leave it out when the change is already live.',
    ),
  status: enumOf(stageIds, 'Unknown status on an update.')
    .optional()
    .describe(
      'The stage the streamline was in when this happened. Worked out from the timeline if you leave it out.',
    ),
  impact: enumOf(impactIds, 'Every update needs an impact level.').describe(
    'How much this matters to a reader. Be honest: everything else on the site is driven by it.',
  ),
  title: z
    .string()
    .min(1, { error: 'An update needs a title.' })
    .max(120, { error: 'Keep update titles under 120 characters — put detail in the body.' })
    .describe('One line saying what changed. Under 120 characters — put the detail in the body.'),
  body: z
    .string()
    .optional()
    .describe(
      'Markdown. What changes, when, and what the reader has to do — in the first two sentences. Written as a block scalar: body: |',
    ),
  /**
   * What to say about this in a chat announcement, when the body would not
   * survive the trip — it is too long, or it leans on formatting a chat message
   * cannot carry, or it is written for someone already on the page.
   *
   * Without it the announcement carries the body, shortened. Either way the
   * title and a link to the update are added around it, so an override can
   * never leave a reader with no way through to the detail.
   */
  announcement: z
    .string()
    .min(1, { error: 'An announcement override needs something to say, or leave it out.' })
    .max(1000, { error: 'Keep an announcement under 1000 characters — the page holds the detail.' })
    .optional()
    .describe(
      'What to say about this in a chat announcement, when the body would not survive the trip. Without it the announcement carries the body, shortened. The title and a link are added either way.',
    ),
});

export const streamlineSchema = z.object({
  title: z
    .string()
    .min(1, { error: 'A streamline needs a title.' })
    .max(80, { error: 'Keep titles under 80 characters so they fit on a card.' })
    .describe('What this effort is called. Under 80 characters — it has to fit on a card.'),
  team: z
    .string()
    .regex(slugPattern, {
      error:
        'team must be a team slug in lowercase-with-dashes, matching a file in content/teams/.',
    })
    .describe(
      'The owning team slug. It must match both a file in content/teams/ and the directory this file is in — that is what wires up ownership and review.',
    ),
  category: enumOf(categoryIds, 'Unknown category.').describe(
    'Which kind of work this is. Drives the filters on the roadmap and the catalog.',
  ),
  status: enumOf(stageIds, 'Unknown status.').describe(
    'The stage it is in today. It needs a matching date in the timeline.',
  ),
  summary: z
    .string()
    .min(10, { error: 'Write a sentence explaining what this is and who it affects.' })
    .max(220, { error: 'Keep the summary under 220 characters — it has to fit on a card.' })
    .describe(
      'One sentence: what this is, and who it affects. 10 to 220 characters, because it has to fit on a card.',
    ),
  owners: z
    .array(ownerSchema)
    .min(1, { error: 'Every streamline needs at least one owner.' })
    .describe('Who to ask about this. At least one, and name is the only required part.'),
  timeline: timelineSchema().describe(
    'Stage to date. Past dates are what happened, future dates are the plan. Skip stages freely; unknown stage names are rejected.',
  ),
  phases: z
    .array(phaseSchema)
    .default([])
    .describe(
      'The audience-by-audience rollout, when the thing lands in waves rather than for everyone at once. Independent of status and timeline above, which stay the streamline’s own.',
    ),
  supersedes: z
    .string()
    .regex(/^[a-z0-9-]+\/[a-z0-9-]+$/, {
      error: 'supersedes must look like team-slug/streamline-slug.',
    })
    .optional()
    .describe('team-slug/streamline-slug of the streamline this one replaces.'),
  announceChannel: channelSchema
    .optional()
    .describe(
      "Send this one's announcements somewhere other than its team's channel. For the one thing that matters to a different audience than everything else the team owns.",
    ),
  /**
   * Optional rather than defaulted to `true`: Astro caches parsed content by
   * file digest, so a schema default does not re-run for a file that has not
   * changed, and a field that is sometimes `true` and sometimes `undefined` is
   * worse than one that is only ever absent or `false`.
   */
  announce: z
    .boolean()
    .optional()
    .describe(
      'Set to false to keep this one out of the chat announcements. Its changes are still recorded as seen, so turning it back on later says nothing about the months it was off.',
    ),
  links: z
    .array(linkSchema)
    .optional()
    .describe('Migration guides, dashboards, docs — whatever a reader needs next.'),
  /**
   * A block scalar, like an update body:
   *
   *     body: |
   *       ## Why now
   *
   *       The 1.30 series goes out of support in March.
   */
  body: z
    .string()
    .optional()
    .describe(
      'The long explanation, in Markdown, shown under the timeline: why this is happening and what a reader has to do. Written as a block scalar: body: | — and optional. A page with nothing under the timeline is a complete page.',
    ),
  updates: z
    .array(updateSchema)
    .default([])
    .describe('The running log of announcements. Newest first, and never edited away.'),
});

export type TeamData = z.infer<typeof teamSchema>;
export type StreamlineData = z.infer<typeof streamlineSchema>;
export type UpdateData = z.infer<typeof updateSchema>;
export type PhaseData = z.infer<typeof phaseSchema>;
export type OwnerData = z.infer<typeof ownerSchema>;
export type LinkData = z.infer<typeof linkSchema>;
