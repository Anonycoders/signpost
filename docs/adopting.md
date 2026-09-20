# Adopting Signpost

A guide to forking this repository and running it for your own organization, on
github.com or GitHub Enterprise. Allow an hour, most of which is writing your
first few streamlines.

Nothing company-specific lives outside two places:

| | |
| --- | --- |
| `site.config.ts` | Your name, branding, lifecycle, categories, impact levels |
| `content/` | Your teams and your streamlines |

Everything else is the product. If you find yourself editing a component to
change a label or a colour, something has gone wrong — open an issue upstream.

---

## 1. Fork and run it

```bash
git clone https://github.com/<your-org>/<your-fork>.git
cd <your-fork>
nvm use            # the Node version is pinned in .nvmrc
npm install
npm run dev        # http://localhost:4321
```

GitHub names a fork after the repository it came from, so `<your-fork>` is
usually `signpost` — but rename it if `roadmap` or `platform-signpost` is what
your organization will search for. Nothing in the project reads its own
directory or repository name: the URL is `repository.url` in step 2, and the
deployed path comes from Pages in step 5.

You now have an empty site. It builds, every page renders, and every page tells
you what to add — no teams, no streamlines, nothing on the roadmap. That is the
intended starting point, and you fill it in step 4.

To see a populated one while you configure, the sample instance is at
[anonycoders.github.io/signpost-sample](https://anonycoders.github.io/signpost-sample/),
from [`Anonycoders/signpost-sample`](https://github.com/Anonycoders/signpost-sample)
— this same site with invented content left in: four platform teams, thirteen
streamlines covering every lifecycle stage. Keeping it open in a tab, or cloned
alongside, makes it much easier to see what a setting does.

**Node.** `.nvmrc` pins the major version and `package.json` sets an `engines`
floor; `.npmrc` turns on `engine-strict` so an old Node fails the install with
an explanation instead of a stack trace. CI reads the same `.nvmrc`, so there
is one version to bump.

---

## 2. Configure the site

Open [`site.config.ts`](../site.config.ts). It is commented throughout; this is
the tour.

### Identity

```ts
name: 'Signpost',
tagline: 'What the platform teams are building, and what changes next.',
description: 'A shared, always-current view of every platform streamline…',
organization: 'Example Organization',
```

`name` appears in the header, page titles and feeds. `tagline` is the home page
headline. `description` is the hero paragraph and the default meta description.

### Repository and contact

```ts
repository: {
  url: 'https://ghe.example.com/platform/signpost',  // no trailing slash
  branch: 'main',
},
contact: {
  label: '#platform-questions',
  url: 'https://ghe.example.com/platform/signpost/issues',
},
```

`repository` builds every **Edit this page** link, so point it at wherever this
repository actually lives — GitHub Enterprise URLs work exactly the same as
github.com ones. `contact` is the footer link for people whose question the
site cannot answer; a chat channel URL is a good choice.

The two are independent, and it is normal for them to point somewhere different
from each other. The sample instance is the worked example: its `repository` is
its own repository, so **Edit this page** opens the file the reader is actually
looking at, while its `contact` is left pointing at this project's issue tracker,
because a question about how Signpost behaves belongs upstream rather than in a
site full of invented teams. Set `repository` to where your content lives, and
`contact` to wherever the person asking will get an answer.

### Slack workspace

```ts
slackWorkspaceUrl: 'https://acmeco.slack.com',
// Enterprise Grid: 'https://acmeorg.enterprise.slack.com'
```

Optional, and the only setting here that changes what a link *does* rather than
what it says. Leave it out and nothing breaks: an owner's Slack handle is still
printed beside their name, it simply is not clickable.

Set it and any owner carrying a `slackId` gets a handle that links straight to
them in Slack. Both halves are required because Slack will not resolve a display
name: this setting says which workspace, the member ID in the content file says
which person, and neither is an address on its own. Contributors are told how to
find a member ID in [CONTRIBUTING.md](../CONTRIBUTING.md); they only have to do
it once per person.

Set this before you ask anyone for IDs, not after. The validator warns when IDs
have been collected into content that has nowhere to point them, which is a
courtesy rather than a substitute for doing it in the right order.

### Locale

```ts
locale: 'en-GB',
```

Any BCP 47 tag your runtime's `Intl` supports. It controls date formatting
only. Dates are always rendered in UTC, deliberately: a reader in Bangalore and
a reader in Denver see the day the author wrote, not one shifted by their
offset.

### Lifecycle

The six default stages are a general-purpose platform lifecycle:

```
proposed → in-development → rolling-out → generally-available → deprecated → retired
```

Rename them, reorder them, add or remove them. Order in the array **is** the
lifecycle order — it drives the stage stepper, the roadmap bars and the
validator's chronology check. Two flags carry meaning:

| Flag | Meaning |
| --- | --- |
| `terminal: true` | The work is finished and no longer changing. Faded on the roadmap, excluded from "in flight" counts, and the target of the retirement rule |
| `windingDown: true` | The thing is going away. Anything in this stage **must** carry a date for a terminal stage, or the build fails |

Those two flags are how the anti-surprise rule survives renaming. Call your
stages `sunsetting` and `switched-off` and the validator will say *"A sunsetting
streamline must say when it will be switched off"* — no code to touch. A
lifecycle with a `windingDown` stage needs at least one `terminal` stage for it
to point at; the validator says so if you forget.

### Categories and impact levels

```ts
categories: [
  { id: 'developer-experience', label: 'Developer Experience', tone: 'violet' },
  …
],
```

Categories are yours to define — they are only a filter and a badge. Changing an
`id` means updating every content file that uses it, so pick them before you
write much content.

Impact levels carry one extra field:

```ts
{ id: 'breaking', label: 'Breaking', description: '…', tone: 'red', weight: 30 },
```

`weight` is how the site decides what is worth interrupting someone for.
Anything at or above `attentionWeight` reaches the home page strip and the
summary line on streamline cards.

### After renaming any of those, run `npm run schema`

```bash
npm run schema     # rewrites schemas/, then commit it
```

`schemas/` is what a contributor's editor reads to offer them field names and
stage names as they type, and it is generated from the three lists above.
Regenerate it and commit the result whenever you change them, or everyone
writing content keeps being offered a stage that no longer exists. CI checks
this for you: the `--check` step in `ci.yml` fails on a stale `schemas/` and
tells you the command to run.

### Tuning the noise

```ts
attentionWindowDays: 60,   // how far ahead "Needs your attention" looks
attentionWeight: 20,       // minimum impact weight to appear there
recentWindowDays: 30,      // how far back "Recently changed" looks
roadmapQuarters: { past: 1, future: 4 },
```

With the default impact levels, `attentionWeight: 20` means breaking **and**
action-required; raise it to `30` for breaking changes only. If people start
ignoring the home page, this is the dial to turn.

### Colours

Every stage, category and impact level picks a `tone` from a fixed palette:
`gray`, `blue`, `violet`, `green`, `amber`, `red`, `teal`, `pink`. Each tone is
defined for light and dark themes in
[`src/styles/global.css`](../src/styles/global.css), so badges stay legible in
both without anyone hand-picking hex codes. The accent colour, surfaces and
text tokens live in the same file, under `@theme`.

To rebrand: change `--color-accent*` in `@theme` (and its dark counterpart in
the `@media screen` block below), and replace `public/favicon.svg`.

---

## 3. Wire up ownership

[`.github/CODEOWNERS`](../.github/CODEOWNERS) is what makes this scale to a
dozen teams without a bottleneck. Each team owns its own content directory, so
teams merge their own updates and nobody waits on a central reviewer:

```
/content/streamlines/devops/              @your-org/devops
/content/teams/devops.yaml                @your-org/devops
```

The shipped file is a skeleton: the pattern is there, but every rule is
commented out and every handle is a placeholder, because a handle that does not
resolve in your organization silently requires nobody. Uncomment the lines you
want and put your own team handles in — GitHub Enterprise handles work the same
way. Then, in **Settings → Branches**, protect `main` with *Require a pull
request before merging* and *Require review from Code Owners*. Without branch
protection CODEOWNERS is only a suggestion.

Keep the code itself owned by whoever maintains the site. That is the catch-all
at the top of the file, and it goes first precisely because the last matching
rule wins: a change to `src/` needs the platform team, while a change to
`content/streamlines/devops/` needs only DevOps.

---

## 4. Add your first team and streamline

`content/` arrives empty — `content/teams/` and `content/streamlines/` hold
nothing but a `.gitkeep` so that Git carries the directories at all. Add one
YAML file per team and one per streamline, exactly as
[CONTRIBUTING.md](../CONTRIBUTING.md) describes — that guide is written for your
colleagues, and it is the same process for you.

Until you do, nothing is broken: every page falls back to an empty state that
tells the reader what to add, the feeds are valid with no entries in them, and
the validator passes with a single warning that no teams are defined yet. That
is deliberate, so a fresh fork is a usable starting point rather than a wall of
zeroes or a stack of errors. Start with one team file — the warning goes, the
team page appears, and the shape of the thing becomes obvious.

```bash
npm run validate   # content rules
npm run build      # validate + full build
```

**Start small.** Three streamlines that are accurate beat twenty that are six
months stale. The validator warns about anything active with no update for six
months, which is the feedback loop that keeps a fork honest.

---

## 5. Deploy to Pages

The repository ships three workflows:

| Workflow | Runs on | Does |
| --- | --- | --- |
| [`ci.yml`](../.github/workflows/ci.yml) | every pull request | validate → schema → type-check → test → build |
| [`deploy.yml`](../.github/workflows/deploy.yml) | push to `main`, nightly, manual | build → upload → deploy to Pages |
| [`announce.yml`](../.github/workflows/announce.yml) | a schedule, manual | post what changed to Slack — inert unless configured |

On github.com, and on GitHub Enterprise with Actions and Pages enabled:

1. **Settings → Pages → Build and deployment → Source: GitHub Actions.**
2. Push to `main`.
3. Watch the **Deploy** workflow. It publishes to the URL shown on the
   `github-pages` environment.

That is the whole setup. There is nothing to provision and no runtime to keep
patched. The one thing that ever needs a secret is announcing changes in Slack,
which is optional and described below; publishing the site itself needs none.

### URLs and the base path

You do not hardcode your URL anywhere. `actions/configure-pages` asks GitHub
where the site is about to be published, and the deploy workflow hands that
straight to the build as two environment variables:

| Variable | Comes from |
| --- | --- |
| `SITE_URL` | the Pages origin the action reports |
| `BASE_PATH` | the Pages base path the action reports |

[`deploy.yml`](../.github/workflows/deploy.yml) is the authoritative copy of
that wiring, including which version of the action it pins — read it there
rather than trusting a snippet in a guide that nobody bumps.

[`astro.config.mjs`](../astro.config.mjs) reads both, falling back to
`http://localhost:4321` and `/` locally. This is what makes the same build work
at a domain root (`https://signpost.example.com/`) and under a project subpath
(`https://pages.ghe.example.com/platform/signpost/`) without a config change.

Every internal link goes through a helper that prefixes the base path, so a
subpath deployment does not produce a site full of 404s. If you add pages, use
`url('/somewhere')` from `src/lib/url.ts` rather than writing hrefs by hand.

For a **custom domain**, set it in Settings → Pages as usual; `configure-pages`
picks it up and the build follows.

### The nightly rebuild

```yaml
schedule:
  - cron: '17 3 * * *'
```

"Today" is baked in at build time — the relative dates ("in 3 weeks"), the today
marker on the roadmap, and the line between *Still to come* and *Recently
changed* are all computed when the site is generated. A repository nobody
merges to for a fortnight would otherwise serve a fortnight-old idea of now,
and the roadmap's today line would drift quietly backwards. The nightly run
keeps the site honest without anyone doing anything.

Move the time if it collides with something; keep the job.

### Announcing changes in Slack

Everything above publishes a site. A site can only tell people what changed if
they come and look, and the thing this project exists to prevent — somebody
finding out about a shutdown after it happened — still happens to everyone who
does not visit.

The site publishes an Atom feed at `/feed.xml`, and one per team at
`/teams/<slug>/feed.xml`, and most chat platforms can subscribe to a feed
directly. If that is enough for you, it costs nothing to maintain and you can
stop reading here. Be clear about what it is, though: **the feed carries updates
only.** It says nothing when a streamline reaches a stage, nothing when a phase
date moves, and nothing ahead of a retirement date. It has no per-team routing
beyond one feed per team, and everybody in the channel gets everything.

The alternative is [`announce.yml`](../.github/workflows/announce.yml), a
scheduled job that reads the content, works out what has changed since it last
looked, and posts it to the channels you name. It is off until you configure it.

**1. Make a Slack app and let it post.** At <https://api.slack.com/apps>, create
an app, add the `chat:write` bot scope under **OAuth & Permissions**, install it
to your workspace, and copy the bot token — it starts `xoxb-`.

**2. Invite it to the channels.** Type `/invite @YourAppName` in each channel you
are going to name below. A bot can post only where it has been invited, and
`not_in_channel` is the one failure everybody hits first.

**3. Add the token as a repository secret** named `SLACK_BOT_TOKEN`, under
**Settings → Secrets and variables → Actions**. It never goes in
`site.config.ts`.

**4. Turn it on** in `site.config.ts`:

```ts
announcements: {
  siteUrl: 'https://acmeco.github.io/signpost',
  channel: '#platform-news',
},
```

`siteUrl` is the only required field, and it is written out rather than derived
because the announcer is a plain Node script — there is no Astro build around it
to ask where the site lives. Every message links back here, so getting it wrong
produces announcements nobody can act on. `channel` is the fallback; a team or a
single streamline can name its own, and `npm run validate` tells you about any
streamline that would have nowhere to go. Two more optional fields, `lookbackDays`
and `maxPerRun`, are documented on the type itself.

**The first run says nothing.** A roadmap with any history in it holds dozens of
dated things, most of them in the future, and a job that announced what it found
on day one would arrive as a burst that gets the channel muted for good. So a
streamline the job has never seen is recorded silently, and only what changes
*after* that is announced. The same rule makes bulk imports safe: add fifty
streamlines in one pull request and the channel stays quiet.

**What it remembers, and where.** A file called `announced.json` on a branch
named `signpost-state`, which holds nothing else and is never merged into `main`.
Keeping it off `main` is deliberate: the job never touches `content/`, never
opens a pull request, and never triggers a rebuild of the site. The branch is
created on the first run; you do not need to make it.

**Messages name dates, not states.** "Retirement moved from 31 March 2027 to 30
June 2027", never "this is now deprecated". A streamline's `status` and its
`timeline` are written by hand and separately, so a message claiming a state can
contradict the page it links to. A date cannot, and a date is what a reader has
to plan around.

**Before you turn it on for real**, see what it would say:

```bash
npm run announce -- --dry-run
```

That prints the messages and writes nothing — no ledger, no posts. It needs no
token.

**One caveat about the schedule.** GitHub disables scheduled workflows on a
**public** repository after 60 days with no activity in it. A roadmap that
nobody has touched for two months is exactly the kind that is holding a
retirement date somebody has forgotten, so this is worth knowing: if your
instance is public and quiet, re-enable the workflow from the Actions tab, or
run it by hand from there. Internal repositories and GitHub Enterprise are not
affected.

Per-streamline controls — sending one streamline somewhere else, keeping one
quiet, or overriding the text of a single announcement — are in
[CONTRIBUTING.md](../CONTRIBUTING.md), because they live in the content files
rather than here.

---

## 6. If your GHE has Pages disabled

Plenty of Enterprise instances do. The build is a directory of static files with
no server-side anything, so it will run on whatever you already have.

**Option A — publish the artifact somewhere.** Replace the `deploy` job with a
step that ships `dist/` to your host. The build job needs no changes beyond
setting the URL yourself:

```yaml
- name: Build site
  run: npm run build
  env:
    SITE_URL: https://signpost.example.com
    BASE_PATH: /
```

S3 + CloudFront, Azure Blob static hosting, Netlify, an Nginx container, a
shared web server — any of them work. Upload the contents of `dist/`.

**Option B — download it.** Keep CI, drop the deploy job, and add:

```yaml
- uses: actions/upload-artifact@v4
  with:
    name: site
    path: dist
```

Anyone can then download the build from the Actions run and open it. Less
convenient, but it gets a fork off the ground on day one while you argue with
whoever owns hosting.

Two things to keep whichever route you take: **build on a schedule**, for the
reason above, and **set `SITE_URL` correctly**, because it is what the Atom
feeds use to build absolute entry links.

---

## 7. Optional adjustments

**Issue templates.** `.github/ISSUE_TEMPLATE/` uses YAML issue forms. GitHub
Enterprise supports those from 3.4; on anything older, replace each `.yml` with
a plain Markdown template — same directory, same purpose, slightly less
structure.

**The fonts.** Inter is vendored through `@fontsource-variable/inter`, so
nothing is fetched from a third party at runtime — which also means the site
works on an air-gapped Enterprise instance. To change it, swap the package and
the `--font-sans` token in `global.css`.

**Search.** Filtering and search on the catalog are plain client-side
JavaScript over server-rendered cards, with no index to build. That holds
comfortably into the hundreds of streamlines. Past that, look at
[Pagefind](https://pagefind.app/).

**Analytics.** There is none, and adding a tag to `BaseLayout.astro` takes a
line. Consider whether you want it: an internal roadmap that logs who read
which deprecation is a different product from one that does not.

---

## What you are signing up for

Signpost has no backend, no database and no scheduled maintenance. The running
cost is keeping the dependencies current — Astro, Tailwind and a handful of
small libraries — which is a Dependabot PR and a CI run.

The real cost is cultural, and it is the one that decides whether this works:
**teams have to post.** The site makes it cheap (one file, one PR, your own
team's approval) and it makes staleness visible (the validator warns, the
roadmap shows the gap). It cannot make anybody care. The organizations where
this works are the ones where "did you put it on Signpost?" becomes a normal
question in a planning meeting.

## Getting help

Open an issue upstream. If you have adapted it in a way others would benefit
from — a different lifecycle model, a deployment target we have not covered —
a pull request to this guide is very welcome.
