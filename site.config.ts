/**
 * Signpost configuration.
 *
 * This is the only file (besides `content/`) that an adopting organization
 * needs to edit. Nothing company-specific belongs anywhere else in the repo.
 */

/**
 * Colour tones available to stages, categories and impact levels.
 * Each tone is defined for light and dark themes in `src/styles/global.css`.
 * Pick from this list rather than writing raw colours, so every badge on the
 * site stays legible and consistent in both themes.
 */
export const TONES = [
  'gray',
  'blue',
  'violet',
  'green',
  'amber',
  'red',
  'teal',
  'pink',
] as const;

export type Tone = (typeof TONES)[number];

export interface LifecycleStage {
  /** Value used in content files (`status:` and `timeline:` keys). */
  id: string;
  /** Human label shown on badges and timelines. */
  label: string;
  /** One line explaining what this stage means, shown in tooltips and docs. */
  description: string;
  tone: Tone;
  /**
   * True for stages where the streamline is finished and no longer changing.
   * Used to fade completed work on the roadmap and exclude it from "active" counts.
   */
  terminal?: boolean;
  /**
   * True for a stage that means "this is going away". Anything sitting in such
   * a stage must carry a date for a terminal stage, enforced by the validator —
   * the rule that exists because surprise shutdowns are the problem this site
   * was built to prevent.
   *
   * A lifecycle with a winding-down stage needs a terminal stage for it to
   * point at.
   */
  windingDown?: boolean;
}

export interface Category {
  id: string;
  label: string;
  tone: Tone;
}

export interface ImpactLevel {
  id: string;
  label: string;
  /** Shown next to the badge to tell a reader what it means for them. */
  description: string;
  tone: Tone;
  /**
   * Items at or above this weight are surfaced on the home page's
   * "Needs your attention" strip. Higher = more urgent.
   */
  weight: number;
}

/**
 * Announcing changes in chat, for the people who will never visit the site.
 *
 * Leave this out and the feature does not exist: nothing is scheduled, nothing
 * is posted, and the workflow that would do it exits without doing anything.
 * Fill it in and `.github/workflows/announce.yml` starts posting changes to
 * Slack on the schedule you give it. The bot token is a repository secret named
 * `SLACK_BOT_TOKEN` and never belongs in this file.
 */
export interface AnnouncementConfig {
  /**
   * The site's public address, including any base path — for example
   * `https://acme.github.io/signpost`, or `https://roadmap.acme.com`.
   *
   * Written out here rather than derived, because the announcer is a plain
   * Node script: there is no Astro build around it, so neither the `site` from
   * astro.config nor `import.meta.env.BASE_URL` exists when it runs. Every
   * announcement links back here, so an announcement with no address would be
   * a notification nobody can act on.
   */
  siteUrl: string;
  /**
   * Where to post when neither the streamline nor its team names a channel.
   * Without it, and without one of those two, nothing is sent — and the
   * validator says which streamlines have nowhere to go.
   */
  channel?: string;
  /**
   * How far back a change can be dated and still be worth announcing, in days.
   * Defaults to 14.
   *
   * This is not what stops a first run from announcing the entire backlog —
   * nothing dated in the future would be caught by a window on the past. It is
   * what stops a date backfilled into last year from arriving as news.
   */
  lookbackDays?: number;
  /**
   * The most messages one run will send. Defaults to 10.
   *
   * A cap, not a quota: anything held back is not recorded as sent, so the next
   * run picks it up. It exists so that a mistake in a large pull request costs
   * one quiet run and a red workflow rather than a hundred notifications.
   */
  maxPerRun?: number;
}

export interface SiteConfig {
  /** Product name shown in the header, page titles and feeds. */
  name: string;
  /** One-line pitch, used on the home page hero and as the default meta description. */
  tagline: string;
  description: string;
  /** Organization that runs this instance, shown in the footer. */
  organization: string;
  /**
   * Repository that holds this content. Used to build "Edit this page" links
   * and the contribute call-to-action. Works with github.com or GitHub Enterprise.
   */
  repository: {
    /** Web URL of the repository root, no trailing slash. */
    url: string;
    /** Branch that the site deploys from. */
    branch: string;
  };
  /**
   * The repository this one was forked from, for `npm run update`.
   *
   * `repository` above is *your* copy — the one "Edit this page" points at.
   * This is the one updates come from, and for a fork of a fork it is whichever
   * repository you actually forked; anything further upstream is their problem,
   * not yours.
   *
   * Nothing on the site reads it. It exists so that a fresh clone with no
   * remotes configured still knows where its updates live, which is the one
   * moment the answer is hard to find. An existing `template` git remote wins
   * over it, because that is what your git is actually set up to do.
   */
  template?: {
    /** Repository to take updates from. A clone URL or the web URL. */
    url: string;
    /** Branch updates come from. Defaults to `main`. */
    branch?: string;
  };
  /** Where to send people who have a question the site cannot answer. */
  contact: {
    label: string;
    url: string;
  };
  /**
   * Your Slack workspace, if the people who own streamlines are reachable in
   * it. Leave it out and nothing breaks: owners' Slack handles are still
   * printed, they simply are not links.
   *
   * Set it and any owner carrying a `slackId` gets a clickable handle. Both
   * halves are needed because Slack will not resolve a display name — the
   * workspace says where, the member ID says who, and neither alone is an
   * address.
   *
   * A workspace: `https://acmeco.slack.com`. An Enterprise Grid org:
   * `https://acmeorg.enterprise.slack.com`. The two address a member by
   * different paths, and the site follows whichever host you name here.
   */
  slackWorkspaceUrl?: string;
  /**
   * Post changes to Slack on a schedule. Absent means the feature is off.
   * See {@link AnnouncementConfig}.
   */
  announcements?: AnnouncementConfig;
  /**
   * Locale used to format dates. Dates are always rendered in UTC, so a reader
   * anywhere sees the day the author wrote rather than one shifted by their
   * own timezone.
   */
  locale: string;
  lifecycle: LifecycleStage[];
  categories: Category[];
  impactLevels: ImpactLevel[];
  /** How far ahead the "Needs your attention" strip looks, in days. */
  attentionWindowDays: number;
  /**
   * Minimum impact weight for something to count as needing attention.
   * Used by the home page strip and by streamline cards, which surface their
   * latest update only when it clears this bar. Raise it to make the site
   * quieter; with the default impact levels, 30 means breaking changes only.
   */
  attentionWeight: number;
  /**
   * How far back the "Recently changed" section of the changes page looks, in
   * days. Long enough that someone returning from leave sees what they missed;
   * short enough that the page stays about what is happening now.
   */
  recentWindowDays: number;
  /** Number of quarters shown on the roadmap, counted from the current quarter. */
  roadmapQuarters: {
    past: number;
    future: number;
  };
}

export const siteConfig: SiteConfig = {
  name: 'Signpost',
  tagline: 'What the platform teams are building, and what changes next.',
  description:
    'A shared, always-current view of every platform streamline: who owns it, which stage it is in, and what is about to change for the teams that depend on it.',
  organization: 'Example Organization',

  repository: {
    url: 'https://github.com/Anonycoders/signpost',
    branch: 'main',
  },

  // Where `npm run update` takes updates from. A direct fork of Signpost keeps
  // this as it is; a fork of a fork points it at the one it forked.
  template: {
    url: 'https://github.com/Anonycoders/signpost',
    branch: 'main',
  },

  contact: {
    label: '#platform-questions',
    url: 'https://github.com/Anonycoders/signpost/issues',
  },

  // Uncomment and point at your own workspace to make owners' Slack handles
  // clickable. See the field's documentation above for why an owner also
  // needs a `slackId` before their handle can link anywhere.
  // slackWorkspaceUrl: 'https://acmeco.slack.com',

  // Uncomment to announce changes in Slack. The site stays exactly as it is
  // either way — this only adds a scheduled job that posts what changed, for
  // the people who are never going to visit a roadmap. You also need a
  // `SLACK_BOT_TOKEN` repository secret; see docs/adopting.md.
  // announcements: {
  //   siteUrl: 'https://acmeco.github.io/signpost',
  //   channel: '#platform-news',
  // },

  locale: 'en-GB',

  /**
   * The platform lifecycle. Order matters: it defines progression on the
   * roadmap and the stage stepper. Rename or extend freely — the site reads
   * these definitions rather than hard-coding stage names.
   */
  lifecycle: [
    {
      id: 'proposed',
      label: 'Proposed',
      description: 'Under discussion. Scope and timing may still change entirely.',
      tone: 'gray',
    },
    {
      id: 'in-development',
      label: 'In development',
      description: 'Being built. Not yet available to other teams.',
      tone: 'blue',
    },
    {
      id: 'rolling-out',
      label: 'Rolling out',
      description: 'Being adopted in waves. Consuming teams may need to act.',
      tone: 'violet',
    },
    {
      id: 'generally-available',
      label: 'Generally available',
      description: 'Supported and ready for everyone to use.',
      tone: 'green',
    },
    {
      id: 'deprecated',
      label: 'Deprecated',
      description: 'Still running, but going away. Migrate before the retirement date.',
      tone: 'amber',
      windingDown: true,
    },
    {
      id: 'retired',
      label: 'Retired',
      description: 'Switched off. Kept here as a record of what happened.',
      tone: 'gray',
      terminal: true,
    },
  ],

  categories: [
    { id: 'developer-experience', label: 'Developer Experience', tone: 'violet' },
    { id: 'ai', label: 'AI', tone: 'pink' },
    { id: 'infrastructure', label: 'Infrastructure', tone: 'blue' },
    { id: 'internal-tooling', label: 'Internal Tooling', tone: 'teal' },
    { id: 'security', label: 'Security', tone: 'red' },
    { id: 'data', label: 'Data', tone: 'amber' },
  ],

  impactLevels: [
    {
      id: 'breaking',
      label: 'Breaking',
      description: 'Things will break if you do nothing.',
      tone: 'red',
      weight: 30,
    },
    {
      id: 'action-required',
      label: 'Action required',
      description: 'You need to do something, by a date.',
      tone: 'amber',
      weight: 20,
    },
    {
      id: 'info',
      label: 'Info',
      description: 'Good to know. No action needed.',
      tone: 'blue',
      weight: 10,
    },
  ],

  attentionWindowDays: 60,
  attentionWeight: 20,
  recentWindowDays: 30,

  roadmapQuarters: {
    past: 1,
    future: 4,
  },
};

export default siteConfig;
