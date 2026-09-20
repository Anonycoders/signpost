# Contributing

Everything on this site comes from files in this repository. There is no admin
panel and no database: you edit a file, open a pull request, and the site
rebuilds when it merges.

Two things you might be here to do:

- **[Post an update](#post-an-update)** — tell everyone something is changing.
  Two minutes, one file, four lines.
- **[Add a streamline](#add-a-streamline)** — put a new product, initiative or
  migration on the roadmap. Five minutes, one new file.

You do not need to run anything locally for either. If you edit these files
often, [your editor can fill them in for you](#let-your-editor-fill-it-in-for-you);
if you would rather see the page before you push, see
[Preview it locally](#preview-it-locally).

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
    actions: # optional: the things somebody has to actually do
      - Run `kubectl deprecations` against every cluster you own.
      - Move any v1beta1 Ingress objects to `networking.k8s.io/v1`.
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

### Say what the reader has to do

`actions` is the list of things somebody has to go and do. It is separate from
the body because an instruction inside a paragraph is an instruction people skim
past — and because this list is the part that travels.

```yaml
actions:
  - Run `kubectl deprecations` against every cluster you own.
  - Move any v1beta1 Ingress objects to `networking.k8s.io/v1` before 1 October.
  - Check the [migration guide](https://example.com/k8s-1-31) for the manifests.
```

It shows on the page under **What you need to do**, in the feed, and in the chat
announcement if your instance sends those — three places a reader might be
standing when they need it, from one list you wrote once.

One instruction per line, under 200 characters. Bold, italic, `code` and links
work; headings, lists and tables do not, because a line of a list is not the
place to start a new document. Where the formatting cannot travel — a feed
summary, a chat message — the line is flattened to its words, so write one that
still reads without it. Put the reasoning in the body and keep these to the
doing.

Wrap anything angle-bracketed in backticks: `` `--context <your-cluster>` ``.
Left bare, `<your-cluster>` looks like a tag and is dropped, taking the thing
the sentence was about with it. The same is true of an update body.

Quote any line with a `#` in it — `- "Tell us in #devops"`. Unquoted, YAML reads
the `#` as the start of a comment and throws away the rest of the sentence, and
nothing about the file looks wrong afterwards. The same is true of a `title`,
and it is why the bodies here are written as `|` blocks.

No dates on them. An update already has `date` and `effective`; a deadline
attached to one line of a list is a second calendar that nothing else on the
site knows about. If two things are due on different days, they are two updates.

Leave the field out when there is genuinely nothing to do — most `info` updates
have nothing. A `breaking` update with neither actions nor a body gets a warning
from the validator, because that combination tells a reader their work is about
to break and then stops talking.

---

## Add a streamline

A *streamline* is anything your team is doing that other teams should be able
to see coming: a product, a migration, a rollout, a deprecation.

**1. Check your team exists.** Look for `content/teams/<your-team>.yaml`. If it
is not there, create it — the filename is the team slug, in
lowercase-with-dashes:

```yaml
# yaml-language-server: $schema=../../schemas/team.schema.json
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
`content/streamlines/<your-team>/<streamline-slug>.yaml`. The directory must be
your team's slug — that is what wires up ownership and review. Copy this whole
block and edit it:

```yaml
# yaml-language-server: $schema=../../../schemas/streamline.schema.json
title: Kubernetes 1.31 upgrade
team: devops # must match the directory this file is in
category: infrastructure
status: rolling-out # where it is today, see the stage list below
summary: >-
  Cluster-wide upgrade to Kubernetes 1.31. Workloads still using removed beta
  APIs will stop working when their cluster is upgraded.
owners:
  # name is required; the rest are not. Give whichever ways of reaching this
  # person your organization actually uses. slackId is optional even when slack
  # is set — see "Reaching an owner on Slack" below.
  - name: Jana Okafor
    github: janaokafor
    slack: jana.okafor
    slackId: U024BE7LH
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
body: |
  ## Why we are doing this

  Optional long-form Markdown, shown on the detail page. Motivation, scope,
  FAQ — whatever a team that depends on you would want to read. Everything
  under `body: |` is indented two spaces; that indentation is not part of
  what the page shows.

  ## Who this affects

  Be specific about who has to do something, and who can ignore this entirely.

  ## What we need from you

  The ask, with the deadline.
updates:
  - date: 2026-09-01
    impact: info
    title: All staging clusters are running 1.31
```

**Keep the first line.** It is a comment as far as YAML is concerned, and it is
what points your editor at the schema for this file — the field names, your
organization's own stage names, the date format, all offered as you type. The
number of `../` is how far the file sits from the repository root, so a
streamline in `content/streamlines/<team>/` needs three and a team file in
`content/teams/` needs two. Nothing breaks without it; you just lose the help.
[More on setting that up](#let-your-editor-fill-it-in-for-you).

**3. Open a pull request** with that one file. Your team owns the directory, so
your own team can review and merge it. CI validates the content before anyone
looks at it.

That is the whole process. The streamline appears on the roadmap, in the
catalog, on your team page and in the Atom feed as soon as it merges.

---

## Field reference

### Streamline fields

| Field | Required | Notes |
| --- | --- | --- |
| `title` | yes | Up to 80 characters — it has to fit on a card |
| `team` | yes | Team slug; must match the directory the file is in |
| `category` | yes | One of the categories below |
| `status` | yes | The stage it is in **today** |
| `summary` | yes | 10–220 characters. One sentence: what it is and who it affects |
| `owners` | yes | At least one. `name` required; `github`, `slack`, `slackId` and `email` optional, any combination |
| `timeline` | yes | At least one date, including one for the current `status` |
| `links` | no | `label` + full `url`. Migration guides, dashboards, docs |
| `supersedes` | no | `team-slug/streamline-slug` of the thing this replaces |
| `phases` | no | The rollout, audience by audience — see below |
| `announceChannel` | no | Send this one's announcements somewhere else — see below |
| `announce` | no | `false` keeps this one out of the announcements |
| `body` | no | The long explanation, Markdown, as a block scalar |
| `updates` | no | Newest first |

### Update fields

Each entry under `updates:`, newest first.

| Field | Required | Notes |
| --- | --- | --- |
| `date` | yes | The day you posted it |
| `impact` | yes | `breaking`, `action-required` or `info` |
| `title` | yes | Up to 120 characters. The sentence the feed and the chat message lead with |
| `effective` | no | The day it lands on other people, when that is later |
| `status` | no | The stage this happened in; worked out from the timeline otherwise |
| `body` | no | The explanation, Markdown, as a block scalar |
| `actions` | no | What the reader has to do, one per line, inline Markdown — see above |
| `announcement` | no | What to say in chat instead of the body — see below |

### Reaching an owner on Slack

```yaml
owners:
  - name: Jana Okafor
    slack: jana.okafor # what the page shows
    slackId: U024BE7LH # what makes it a link
```

Two fields, because Slack needs two things and neither one does the job alone.

`slack` is the handle: readable, what a colleague would type to find this
person, and what the page actually prints. On its own it is printed as plain
text.

`slackId` is that person's member ID. Slack has no URL that resolves a display
name — names are not unique and are not addressable — so the ID is the only
identifier a link can be built from. Add it and the handle becomes a link to
their Slack profile. It never appears on the page; nobody has to read it.

To find one: open the member's profile in Slack, click **More**, then **Copy
member ID**. It starts with `U`, or `W` on Enterprise Grid.

This only works if your instance has been pointed at your workspace —
`slackWorkspaceUrl` in [site.config.ts](site.config.ts), set once for everyone.
If it has not been, the validator will tell you rather than leaving you with
handles that quietly refuse to link.

### Announcing changes in chat

Only relevant if your instance has this turned on — if it has not, every field
here is ignored and you can skip the section. When it is on, a scheduled job
posts what changed to Slack, so that people who depend on your work hear about a
date moving without having to visit the site.

You do not mark anything as announced. The job works out what has changed since
it last looked, and the first time it sees a streamline it records it silently —
so adding a file, however much history is in it, never floods a channel.

Three fields let you steer it.

```yaml
announceChannel: '#data-platform-news' # this one goes somewhere else
announce: false # or nowhere at all
```

`announceChannel` overrides the channel your team is announced in, for the one
thing that matters to a different audience than everything else you own. Write
it as `#channel-name`, or as the channel ID Slack shows under **View channel
details** (`C0123ABCD`) — an ID survives the channel being renamed. The same
field on `content/teams/<team>.yaml` sets it for everything that team owns.

Note that this is **not** the team's existing `channel:` field. That one is
inbound: where someone goes to ask you a question. This one is outbound, usually
a channel your consumers are in rather than one you work in.

`announce: false` keeps a streamline quiet. Its changes are still recorded, so
turning it back on later says nothing about the months it was off — it picks up
from that moment.

And on a single update:

```yaml
updates:
  - date: 2026-09-10
    impact: breaking
    title: Ingress v1beta1 is removed on 2 November
    body: |
      The long version, with headings and a table, for someone on the page.
    announcement: >-
      Your Ingress manifests stop working on 2 November. The migration guide has
      a one-line fix.
```

Without `announcement`, the chat message carries a shortened `body`. Add one
when the body would not survive the trip — too long, leaning on formatting chat
cannot carry, or written for someone who is already reading the page. Either way
the title and a link to the update are put around it, so an announcement can
never leave a reader with no way through to the detail.

Write it as plain sentences rather than chat markup. `&`, `<` and `>` arrive on
the screen as you typed them — in a title too — so `Q&A` and `<beta>` come out
whole instead of being read as a link that was never there.

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
error content/streamlines/devops/jenkins-pipelines.yaml
    timeline: A deprecated streamline must say when it will be retired. Add a `retired` date to the timeline so the teams depending on it know their deadline.
    updates[0].effective: effective (2026-08-01) is not after date (2026-09-08). Use effective only when a change lands later than the day you are posting about it; if they are the same day, remove it.

2 problems in 1 file. Fix the lines above and push again.
```

**It will block your PR for:**

- A `team` that has no file in `content/teams/`, or does not match the
  directory the file is in
- A file outside `content/streamlines/<team>/<slug>.yaml`, or a slug that is not
  lowercase-with-dashes
- An unknown `status`, `category` or `impact` — the message lists the valid
  values
- A field name that does not exist, like `supercedes` for `supersedes`, or a
  misspelled stage inside a `timeline`. Nothing you write is skipped quietly: a
  field Signpost does not know is one whose contents would never reach the page
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
- Two updates posted on the same day under the same title, or under titles alike
  enough to collide once shortened — either way they would share one link on the
  page and one entry in the feed, and the second would effectively vanish
- Two phase names that differ only in their punctuation
- An `announceChannel` written as a bare name. Slack will not resolve one, so it
  has to be `#channel-name` or a channel ID

**It will warn, but let you merge:**

- An active streamline with no update for six months. Either post something or
  move the status on — a roadmap nobody maintains is worse than no roadmap.
- A `status` its own timeline has already moved past. The badge says one stage
  and the dates say a later one, and a reader has no way to know which is right.
- A `slackId` with no `slack` handle beside it, or with no workspace configured
  for the site — either way the ID does nothing, and silently.
- A streamline whose changes would be announced but which resolves to no
  channel. The job would work out what changed and then drop it, which looks
  from the outside exactly like a streamline that never changed.
- A `breaking` update with neither `actions` nor a `body`. The badge tells a
  reader their work is about to break, and then the update has nothing to say
  about what to do instead.

Nothing in the validator cares about prose. It cannot tell you that your update
is vague, so that part is on you and your reviewer.

---

## Let your editor fill it in for you

Worth the two minutes if you write content more than once. `Ctrl-Space` lists
the fields that exist. A stage name you half-remember gets offered in full. A
date in the wrong format is underlined while you type it, rather than three
minutes later in CI. And the lists you are offered are **this** repository's,
not the ones Signpost ships with — they are generated from `site.config.ts` into
`schemas/`, so a stage your organization renamed is the stage you get.

Every content file says which schema describes it, on its first line:

```yaml
# yaml-language-server: $schema=../../../schemas/streamline.schema.json
```

```yaml
# yaml-language-server: $schema=../../schemas/team.schema.json
```

That line is a plain YAML comment, so it changes nothing about the site. It is
in the file rather than in an editor setting for three reasons: it works in
anything that speaks
[yaml-language-server](https://github.com/redhat-developer/yaml-language-server)
— VS Code, Neovim, Helix, Zed, the JetBrains IDEs — it survives being copied
into a new streamline, and you can see at a glance that a file is covered. If
you write one from scratch, copy the line across. If you would rather name the
schema in the body of the file, a `$schema:` key does the same job and is the
one field the site itself ignores.

**In VS Code**, install the
[YAML extension](https://marketplace.visualstudio.com/items?itemName=redhat.vscode-yaml)
when the editor offers it; the recommendation is in `.vscode/extensions.json`.
Without it the line above is only a comment and nothing happens.
`.vscode/settings.json` additionally maps the schemas onto `content/` by path,
which covers a file that has lost its first line.

None of this replaces `npm run validate`. The schema knows the shape and the
vocabulary — which fields exist, which values are allowed, what a date looks
like. It does not know the rules that need to look at the rest of the file, like
a `status:` that has fallen behind a date in its own timeline. Nor does any of
it reach you when you edit a file through GitHub in the browser, which is a
perfectly good way to post an update; CI is still what has the last word.

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

If the change is one anybody would notice — a new capability, a fix, anything
that alters what a field means — add a line for it under `## [Unreleased]` in
[CHANGELOG.md](CHANGELOG.md), written the way you would explain it to someone
who has just merged. A typo or a tidy-up does not need one; nothing enforces
this in CI, because a gate that blocks a one-word fix is a gate people learn to
route around. If your change means a fork has to *do* something after merging,
say so in that section's `**Upgrading:**` note — you are the only person who
knows, and by release day nobody will reconstruct it.
[docs/releasing.md](docs/releasing.md) explains what the version numbers
promise.

## Getting help

If something here is wrong, out of date, or does not explain itself, open an
issue — that is a contribution too. Questions about a particular streamline
belong with its owning team; every team page lists their channel.
