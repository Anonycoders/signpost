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
  /** Where to send people who have a question the site cannot answer. */
  contact: {
    label: string;
    url: string;
  };
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
    url: 'https://github.com/example-org/signpost',
    branch: 'main',
  },

  contact: {
    label: '#platform-questions',
    url: 'https://github.com/example-org/signpost/issues',
  },

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
