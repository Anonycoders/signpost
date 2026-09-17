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
git clone https://github.com/<your-org>/signpost.git
cd signpost
nvm use            # the Node version is pinned in .nvmrc
npm install
npm run dev        # http://localhost:4321
```

You now have the demo site: four invented platform teams, thirteen
streamlines covering every lifecycle stage. Keep it while you configure — it is
much easier to see what a setting does with content on the page — and delete it
in step 4.

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

Add two lines per team, using your GitHub Enterprise team handles. Then, in
**Settings → Branches**, protect `main` with *Require a pull request before
merging* and *Require review from Code Owners*. Without branch protection
CODEOWNERS is only a suggestion.

Keep the code itself owned by whoever maintains the site — the shipped file
does this with a catch-all at the top, so a change to `src/` needs the platform
team while a change to `content/devops/` does not.

---

## 4. Replace the demo content

```bash
rm -rf content/teams/* content/streamlines/*
```

Then add one YAML file per team and one Markdown file per streamline, exactly
as [CONTRIBUTING.md](../CONTRIBUTING.md) describes — that guide is written for
your colleagues, and it is the same process for you.

With `content/` empty, the site does not break: every page falls back to an
empty state that tells the reader what to add. That is deliberate, so a fresh
fork is a usable starting point rather than a wall of zeroes.

```bash
npm run validate   # content rules
npm run build      # validate + full build
```

**Start small.** Three streamlines that are accurate beat twenty that are six
months stale. The validator warns about anything active with no update for six
months, which is the feedback loop that keeps a fork honest.

---

## 5. Deploy to Pages

The repository ships two workflows:

| Workflow | Runs on | Does |
| --- | --- | --- |
| [`ci.yml`](../.github/workflows/ci.yml) | every pull request | validate → type-check → test → build |
| [`deploy.yml`](../.github/workflows/deploy.yml) | push to `main`, nightly, manual | build → upload → deploy to Pages |

On github.com, and on GitHub Enterprise with Actions and Pages enabled:

1. **Settings → Pages → Build and deployment → Source: GitHub Actions.**
2. Push to `main`.
3. Watch the **Deploy** workflow. It publishes to the URL shown on the
   `github-pages` environment.

That is the whole setup. There is nothing to provision, no secrets to add, and
no runtime to keep patched.

### URLs and the base path

You do not hardcode your URL anywhere. `actions/configure-pages` reports where
the site is about to be published, and the workflow passes that to the build:

```yaml
- name: Configure Pages
  id: pages
  uses: actions/configure-pages@v5
…
- name: Build site
  run: npm run build
  env:
    SITE_URL: ${{ steps.pages.outputs.origin }}
    BASE_PATH: ${{ steps.pages.outputs.base_path }}
```

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

### Notifications

`deploy.yml` ends with a comment marking where a Slack or Teams webhook step
goes, if you want a ping on every publish. Before you build that: the site
already publishes an Atom feed at `/feed.xml`, and one per team at
`/teams/<slug>/feed.xml`. Most chat platforms can subscribe to a feed directly,
which gives people per-team granularity and costs you nothing to maintain.

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
