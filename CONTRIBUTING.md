# Contributing

Everything on this site comes from files in this repository. There is no admin
panel and no database: you edit a file, open a pull request, and the site
rebuilds when it merges.

Two things you might be here to do:

- **[Post an update](#post-an-update)** — tell everyone something is changing.
  Two minutes, one file, four lines.
- **[Add a streamline](#add-a-streamline)** — put a new product, initiative or
  migration on the roadmap. Five minutes, one new file.

You do not need to run anything locally for either. If you would rather see it
before you push, see [Preview it locally](#preview-it-locally).

---

## Post an update

This is the common case, and the one the site exists for. Open your
streamline's file — the **Edit this page** link at the bottom of every
streamline page takes you straight to it — and add an entry at the **top** of
`updates:`.

```yaml
updates:
  - date: 2026-09-10 # the day you are posting this
    effective: 2026-10-01 # optional: the day the change actually lands
    impact: breaking # breaking | action-required | info
    status: rolling-out # optional: the stage this happened in
    title: Production clusters upgrade from 1 October — Ingress v1beta1 is removed
    body: |
      Production upgrades run in three waves starting **1 October**. Any workload
      still declaring `networking.k8s.io/v1beta1` Ingress objects will fail to
      deploy once its cluster is upgraded.

      Run `kubectl deprecations --context <your-cluster>` to see whether you are
      affected. The migration guide has the before-and-after manifests.
```

Updates are append-at-the-top and never edited away: the history is the point.
Correct a mistake by fixing the entry, but do not delete an announcement
because it turned out to be wrong — post a new one saying so.

### `date` vs `effective`

This trips people up once, and then never again.

| Field | Means | Example |
| --- | --- | --- |
| `date` | The day **you posted** this | `2026-09-10` |
| `effective` | The day the change **lands on other people** | `2026-10-01` |

Leave `effective` out when the change is already live. Add it when you are
warning people in advance — a deprecation announced six weeks early is
`date: 2026-09-10`, `effective: 2026-10-22`.

Why it matters: **Upcoming changes** files your update under the day it lands,
so a warning stays in "Still to come" until the thing it warns about has
actually happened. Without `effective`, an announcement slides into the past a
few days after you post it, which is the opposite of what you wanted.

### Choosing an impact level

Be honest here. Everything else on the site is driven by it.

| Impact | Use it when | What happens |
| --- | --- | --- |
| `breaking` | Things break if the reader does nothing | Red badge; goes to the top of the home page |
| `action-required` | Someone must do something, by a date, but nothing breaks today | Amber badge; on the home page and Upcoming changes |
| `info` | Progress, milestones, good news | Neutral badge; in feeds and on the detail page |

Marking routine progress as `breaking` is the fastest way to teach your
colleagues to ignore the home page. Marking a real breakage as `info` is the
failure this whole site was built to prevent.

### Write the body for the person it lands on

A good update answers three questions in the first two sentences: **what
changes, when, and what do I have to do?** Put the date in the text as well as
the field — people read the sentence, not the metadata. Link the migration
guide. Assume the reader has never heard of your project.

The body is Markdown: bold, links, lists, inline code and fenced blocks all
work.

---

## Add a streamline

A *streamline* is anything your team is doing that other teams should be able
to see coming: a product, a migration, a rollout, a deprecation.

**1. Check your team exists.** Look for `content/teams/<your-team>.yaml`. If it
is not there, create it — the filename is the team slug, in
lowercase-with-dashes:

```yaml
# content/teams/devops.yaml
name: DevOps
mission: Runs the paved road — clusters, CI runners, deployment tooling and the
  guardrails that keep production safe to change.
channel: "#devops"
links:
  - label: Runbooks
    url: https://github.com/example-org/devops-runbooks
```

**2. Create the streamline file** at
`content/streamlines/<your-team>/<streamline-slug>.md`. The directory must be
your team's slug — that is what wires up ownership and review. Copy this whole
block and edit it:

```markdown
---
title: Kubernetes 1.31 upgrade
team: devops # must match the directory this file is in
category: infrastructure
status: rolling-out # where it is today, see the stage list below
summary: >-
  Cluster-wide upgrade to Kubernetes 1.31. Workloads still using removed beta
  APIs will stop working when their cluster is upgraded.
owners:
  - name: Jana Okafor
    github: janaokafor
timeline:
  # stage: the date it reached (or will reach) that stage.
  # Past dates are what happened, future dates are the plan. Skip stages freely.
  proposed: 2026-01-15
  in-development: 2026-03-02
  rolling-out: 2026-09-01
  generally-available: 2026-11-16
links:
  - label: Migration guide
    url: https://github.com/example-org/devops-runbooks/blob/main/k8s-1-31.md
updates:
  - date: 2026-09-01
    impact: info
    title: All staging clusters are running 1.31
---

## Why we are doing this

Optional long-form Markdown, shown on the detail page. Motivation, scope, FAQ —
whatever a team that depends on you would want to read.

## Who this affects

Be specific about who has to do something, and who can ignore this entirely.

## What we need from you

The ask, with the deadline.
```

**3. Open a pull request** with that one file. Your team owns the directory, so
your own team can review and merge it. CI validates the content before anyone
looks at it.

That is the whole process. The streamline appears on the roadmap, in the
catalog, on your team page and in the Atom feed as soon as it merges.

---

## Field reference

### Streamline frontmatter

| Field | Required | Notes |
| --- | --- | --- |
| `title` | yes | Up to 80 characters — it has to fit on a card |
| `team` | yes | Team slug; must match the directory the file is in |
| `category` | yes | One of the categories below |
| `status` | yes | The stage it is in **today** |
| `summary` | yes | 10–220 characters. One sentence: what it is and who it affects |
| `owners` | yes | At least one. `name` required; `github` and `email` optional |
| `timeline` | yes | At least one date, including one for the current `status` |
| `links` | no | `label` + full `url`. Migration guides, dashboards, docs |
| `supersedes` | no | `team-slug/streamline-slug` of the thing this replaces |
| `phases` | no | The rollout, audience by audience — see below |
| `updates` | no | Newest first |

### Rollout phases

When something arrives in waves, say so. **Phases are audiences, not tasks** — a
phase is a group of people who get the thing at a particular point, not a chunk
of work on the way to shipping it.

```yaml
phases:
  - name: Phase 1 — pilot
    audience: Platform and DevOps teams
    status: generally-available
    timeline:
      rolling-out: 2026-02-01
      generally-available: 2026-04-01
  - name: Phase 2 — product teams
    audience: Everyone building on the platform
    status: rolling-out
    timeline:
      rolling-out: 2026-09-01
```

Names have to be unique within the streamline. `audience` is required — it is
the first thing a reader looks at. `status` and `timeline` work exactly as they
do at the top of the file, except that a phase cannot be `deprecated` or
`retired`: phases progress, products deprecate, and the retirement of the thing
itself belongs to the streamline. `timeline` is optional, for a phase that is
declared before it is planned.

Phases may overlap — one wave is usually still bedding in when the next starts —
and the top-level `status` and `timeline` stay the streamline's own.

### Lifecycle stages

Used for both `status` and the keys of `timeline`:

| Stage | Means |
| --- | --- |
| `proposed` | Under discussion. Scope and timing may still change entirely |
| `in-development` | Being built. Not yet available to other teams |
| `rolling-out` | Being adopted in waves. Consuming teams may need to act |
| `generally-available` | Supported and ready for everyone to use |
| `deprecated` | Still running, but going away. Migrate before the retirement date |
| `retired` | Switched off. Kept here as a record of what happened |

A streamline may skip stages — plenty of things go straight from
`in-development` to `generally-available`. Dates must run in lifecycle order,
and dates in the future render as *planned* (hatched bars and diamonds on the
roadmap).

> **If you mark something `deprecated`, you must give it a `retired` date.**
> This is the one rule the site refuses to bend on. An unscheduled shutdown
> hanging over other teams is exactly the problem Signpost exists to prevent.

### Categories

`developer-experience` · `ai` · `infrastructure` · `internal-tooling` ·
`security` · `data`

Stages and categories are configuration, not code — see
[docs/adopting.md](docs/adopting.md) if your organization names things
differently.

---

## What CI checks

Every pull request runs the content validator, then the type-checker, tests and
a full build. The validator runs first, so a content mistake is reported as a
content mistake instead of being buried in a stack trace.

It names the file, the field and what to do:

```
error content/streamlines/devops/jenkins-pipelines.md
    timeline: A deprecated streamline must say when it will be retired. Add a `retired` date to the timeline so the teams depending on it know their deadline.
    updates[0].effective: effective (2026-08-01) is not after date (2026-09-08). Use effective only when a change lands later than the day you are posting about it; if they are the same day, remove it.

2 problems in 1 file. Fix the lines above and push again.
```

**It will block your PR for:**

- A `team` that has no file in `content/teams/`, or does not match the
  directory the file is in
- A file outside `content/streamlines/<team>/<slug>.md`, or a slug that is not
  lowercase-with-dashes
- An unknown `status`, `category` or `impact` — the message lists the valid
  values
- A date that is not a real calendar date, or is written in any format other
  than `YYYY-MM-DD`
- Timeline dates that contradict the lifecycle order — `generally-available`
  before `in-development`, say
- A `status` with no matching date in `timeline`, or an empty `timeline`
- A `deprecated` streamline with no `retired` date
- An `effective` that is not after its `date`
- A date so far off it is almost certainly a typo in the year
- A `supersedes` pointing at a streamline that does not exist
- A summary or title over its length limit

**It will warn, but let you merge:**

- An active streamline with no update for six months. Either post something or
  move the status on — a roadmap nobody maintains is worse than no roadmap.

Nothing in the validator cares about prose. It cannot tell you that your update
is vague, so that part is on you and your reviewer.

---

## Preview it locally

Only needed if you want to see your change before pushing.

```bash
nvm use            # Node version is pinned in .nvmrc
npm install
npm run dev        # http://localhost:4321
```

The dev server picks up content changes as you save. On an older Node,
`npm install` refuses to go any further and tells you which version it wants —
that is `engine-strict` in `.npmrc` doing its job, and it is much nicer than a
stack trace from somewhere inside the build. If you do not use `nvm`, install
the Node version named in `.nvmrc` however you normally would.

Other commands:

```bash
npm run validate   # content rules only — fast, and what CI complains about first
npm run test       # unit tests for the derived data and the validator
npm run check      # TypeScript and Astro diagnostics
npm run build      # validate + full production build into dist/
npm run preview    # serve the built site
```

---

## Conventions

- **One file per pull request.** A streamline change and an unrelated fix in
  one PR means one of them waits for the other.
- **Your team merges your content.** `.github/CODEOWNERS` routes each
  `content/streamlines/<team>/` directory to the team that owns it. No central
  gatekeeper, and no waiting on a platform architect who is on holiday.
- **Dates are `YYYY-MM-DD`, always.** They are rendered in UTC so everyone sees
  the day you wrote, not one shifted by their timezone.
- **Move the status when reality moves.** The status field is what the catalog
  filters and the roadmap colour by. A streamline still marked
  `in-development` six months after launch quietly makes the whole site less
  trustworthy.

## Changing the site itself

Contributions to the code are welcome too.
[docs/developing.md](docs/developing.md) is the guide for that: the data flow,
the two validation layers, the styling tokens and what not to hardcode. The
config surface an organization owns is described separately in
[docs/adopting.md](docs/adopting.md). Run `npm run check && npm run test` before
opening the PR; anything that changes what a contributor sees when they get a
file wrong should come with a test asserting the new wording, because those
messages are the product.

## Getting help

If something here is wrong, out of date, or does not explain itself, open an
issue — that is a contribution too. Questions about a particular streamline
belong with its owning team; every team page lists their channel.
