# Developing Signpost

For someone changing the **code**. If what you want to change is what your
organization publishes — its name, its lifecycle stages, its categories, its
colours, its deploy target — none of that is code, and
[docs/adopting.md](adopting.md) is the guide you want. If you want to publish or
correct content, that is [CONTRIBUTING.md](../CONTRIBUTING.md).

What follows assumes you have cloned the repository and want to know where
things are before you change one of them.

---

## Contents

- [Setup](#setup)
- [The data flow](#the-data-flow)
- [The two validation layers](#the-two-validation-layers)
- [Styling](#styling)
- [Adding a page](#adding-a-page)
- [Adding a doc](#adding-a-doc)
- [Feeds](#feeds)
- [CI](#ci)
- [Deploy](#deploy)
- [Announcements](#announcements)
- [What not to hardcode](#what-not-to-hardcode)

---

## Setup

```bash
nvm use        # reads .nvmrc — Node 26
npm install
npm run dev    # http://localhost:4321
```

`package.json` declares `"engines": { "node": ">=22.12.0" }` and `.npmrc` sets
`engine-strict=true`, so an install on an older Node stops with a sentence about
the version instead of a stack trace from inside Astro or vitest. `.nvmrc` pins
26, which is also what CI installs (`node-version-file: .nvmrc`), so "works on
my machine" and "works in CI" mean the same Node. The two numbers say different
things on purpose: `engines` is the oldest Node a fork can run on, `.nvmrc` is
the one this repository is built and tested against.

| Script | What it runs | What it gates |
| --- | --- | --- |
| `npm run dev` | `astro dev` | Nothing — hot reload, content included. |
| `npm run validate` | `tsx scripts/validate-content.ts` | The content rules. Fast, no build, and the first thing CI reports. |
| `npm run schema` | `tsx scripts/json-schema.ts` | Nothing — rewrites `schemas/` from the Zod schemas. Add `-- --check` and it gates instead: CI fails if what is committed is stale. |
| `npm run check` | `astro check` | TypeScript and Astro diagnostics, including inside `.astro` files. |
| `npm run test` | `vitest run` | The unit tests in `src/lib/*.test.ts` and `scripts/*.test.ts`. |
| `npm run build` | `npm run validate && astro build` | The content rules, then a real production build into `dist/`. It does **not** run `astro check` or the tests, so a green build is not a green gate. |
| `npm run preview` | `astro preview` | Serves `dist/` as it will be deployed. |
| `npm run sync` | `astro sync` | Nothing — regenerates `.astro/types.d.ts` after a schema change, if your editor is showing stale content types. |

**The full gate**, which is what CI runs and what you should run before opening
a pull request:

```bash
npm run validate && npm run schema -- --check && npm run check && npm run test && npm run build
```

`npm run test:watch` is the same vitest in watch mode while you work.

**TypeScript stays on 6.x.** `astro check` drives the compiler through its
programmatic API, and TypeScript 7's native compiler does not expose that API
yet — install 7 and `npm run check` does not report errors, it refuses to run,
which takes type checking out of the gate. Astro tracks the work in
[roadmap discussion 1321](https://github.com/withastro/roadmap/discussions/1321);
raise the dependency when `@astrojs/check` widens its peer range past `^6`.

---

## The data flow

Every page is a pure function of `content/`. The path from a file on disk to
rendered HTML goes through exactly these modules:

```
content/teams/<slug>.yaml
content/streamlines/<team>/<slug>.yaml
docs/*.md
   │
   │  src/content.config.ts     glob loaders; the id is the path, so
   │                            content/streamlines/devops/secret-scanning.yaml
   │                            becomes "devops/secret-scanning"
   ▼
src/lib/schema.ts               Zod shapes for one file
   ▼
src/lib/content.ts              the single cached data layer
   ▼
src/lib/roadmap.ts              lanes, segments, markers, the today line
src/lib/changes.ts              upcoming/recent grouping, "needs attention"
src/lib/timeline.ts             which stage a date falls in
src/lib/feeds.ts  atom.ts       feed entries and the XML around them
src/lib/doc-links.ts            where a link in a guide should point
   ▼
src/pages/*                     routes; src/components/* render
```

`docs/` is content too. The guides you are reading are a third collection, and
[adding a doc](#adding-a-doc) covers what that means for anyone writing one.

### `src/lib/content.ts` is the only place that reads the collections

It is the boundary between Astro and everything else. It builds the `Team`,
`Streamline` and `Update` objects the rest of the site uses, and it does all the
derivation once: stage and category ids become `LifecycleStage` and `Category`
objects, hrefs are built with `url()`, `editUrl` with `blobUrl()`, updates are
sorted newest-first so authors can append them wherever is natural in the file,
and an update with no explicit `status:` is labelled with the stage the
streamline was actually in on the day it was written (via `stageOn()`), so
advancing a streamline does not relabel years of its history.

It caches:

```ts
let cache: Promise<{ teams: Team[]; streamlines: Streamline[]; docs: Doc[] }> | null = null;

function loadOnce() {
  cache ??= load();
  return cache;
}
```

Every accessor — `getTeams`, `getStreamlines`, `getTeam`, `getStreamline`,
`getStreamlinesForTeam`, `getSuperseded`, `getSupersededBy`, `getAllUpdates`,
`getDocs` — goes through `loadOnce()`. A page with twenty routes parses the content once.
**Do not call `getCollection` anywhere else.** If you need a new shape of the
data, add an accessor here.

### Derived logic lives in `src/lib`, free of Astro

`roadmap.ts`, `changes.ts`, `timeline.ts`, `feeds.ts`, `atom.ts` and `date.ts`
import nothing from `astro:content` and nothing from a component. That is what
makes them unit-testable: `vitest.config.ts` runs them directly, with only the
`@config` and `@/` aliases that `tsconfig.json` also declares.

They achieve it by taking **structural types** rather than the content types.
`roadmap.ts` accepts a `RoadmapSubject`, `changes.ts` a `ChangeSubject`,
`feeds.ts` a `FeedUpdate` — each the minimum set of fields that function needs.
A `Streamline` from `content.ts` satisfies them structurally, and a test fixture
satisfies them with four lines of object literal. As `feeds.ts` puts it:

> Structural types rather than the content types, so this stays testable
> without a content collection behind it.

The practical rule for a change: **if it is a decision, it goes in `src/lib` and
gets a test; if it is markup, it goes in a component.** A `.astro` file that
starts calculating dates or percentages is a sign the calculation belongs one
layer down. Tests live next to their module — `roadmap.test.ts` beside
`roadmap.ts` — and there is no separate `tests/` directory.

---

## The two validation layers

Content is checked twice, by two things that share one set of schemas.

**Layer 1 — `src/lib/schema.ts`.** Zod shapes for a *single file in isolation*:
required fields, string lengths, valid dates, enum membership against the ids in
`site.config.ts`. It is imported by `src/content.config.ts` (so the Astro build
enforces it) **and** by `scripts/load-content.ts` (so the CLI validator enforces
the same thing). One definition, so CI and your editor cannot disagree.

**Layer 2 — `scripts/content-rules.ts`.** Everything a per-file schema cannot
see: does that team file exist, does the `team:` field match the directory the
file is in, does the `supersedes:` target exist, do the timeline dates run in
lifecycle order, is `effective` actually after `date`, is a winding-down
streamline carrying an end date. It also warns — never errors — about an active
streamline with no update in 180 days.

Neither of those reads the disk. `scripts/load-content.ts` does, and it is the
only thing outside Astro that does: it walks `content/`, parses each file, and
hands back one entry per file with either the parsed data or the reason there is
none. A streamline's id comes from where its file sits, and that derivation
lives there once — two copies of it, drifting, would mean two ids for one
streamline and nothing anywhere to notice.

`scripts/validate-content.ts` is the thin CLI wrapper: it calls
`validateContent()`, groups problems by file, prints warnings then errors, and
exits non-zero if there are errors.

### Where a new rule goes

- Can you decide it while looking at **one file, one field**, with no knowledge
  of anything else in `content/`? → `src/lib/schema.ts`.
- Does it need another file, another field, or `Date.now()`? →
  `scripts/content-rules.ts`.

A schema rule gets enforced by the Astro build for free. A cross-file rule does
not — only `npm run validate` and `npm run build` (which runs it first) catch
it.

### Rules read config, not stage names

The rule that gave this project its reason to exist — a deprecation must carry a
retirement date — knows no stage names at all:

```ts
const WINDING_DOWN_STAGES = siteConfig.lifecycle.filter((s) => s.windingDown === true);
const TERMINAL_STAGES = siteConfig.lifecycle.filter((s) => s.terminal === true);
```

and its message is built from the labels it found:

```
A deprecated streamline must say when it will be retired. Add a `retired` date
to the timeline so the teams depending on it know their deadline.
```

Rename the stages in `site.config.ts` and the same sentence comes out reading
"A sunsetting streamline must say when it will be switched off". The
configuration itself is validated too: a lifecycle with a `windingDown` stage
and no `terminal` stage is an error against `site.config.ts`, because the
silent failure mode would be deprecations quietly passing validation.

### The messages are the product

A contributor meets this repository through a validator message. That makes the
wording a user-facing surface, not a diagnostic string — **any change to a
message needs a test asserting the new wording.**

The model to copy is
[`scripts/content-rules.config.test.ts`](../scripts/content-rules.config.test.ts).
It swaps the configuration and asserts on the sentence:

```ts
vi.mock('../site.config', () => { /* an "Atlas" config with renamed stages */ });

const { validateContent } = await import('./content-rules');
// ...
expect(messagesOf(result.errors)).toContain(
  'A sunsetting streamline must say when it will be switched off',
);
expect(messagesOf(result.errors)).not.toContain('retired');
```

Two things to copy from it: the `vi.mock` plus top-level `await import()`, which
is necessary because the rules read the config **once at import**; and the
separate file, because one module cannot see two configurations.
`scripts/content-rules.test.ts` covers the rules under the real configuration.

### One import gotcha

`src/lib/schema.ts` imports `'../../site.config'`, and everything under
`scripts/` imports `'../site.config'` and `'../src/lib/…'` — relative paths, not
the `@config` and `@/` aliases the rest of `src/lib` uses. That is the
convention on the validator's import path, because those modules are loaded
three different ways: by Vite during the build, by vitest, and by `tsx` from the
command line. Relative paths resolve identically in all three; `@config` does
not, because under `tsx` it is resolved against the current directory rather
than the repo root. Keep them relative when you edit anything in `scripts/`, and
remember that a change there has to satisfy `npm run validate` as well as
`npm run build`.

### The third reader is the editor

Both layers tell a contributor what is wrong after they have written it.
[`scripts/json-schema.ts`](../scripts/json-schema.ts) converts the layer-1 Zod
schemas to JSON Schema in `schemas/`, which is what tells them while they are
typing. `npm run schema` regenerates it. A content file reaches its schema
through the `# yaml-language-server: $schema=…` comment on its own first line,
which works in any editor running that language server;
`.vscode/settings.json` maps the same schemas by path as a backstop for a file
written without it. Both routes go through the same language server, so in VS
Code both need `redhat.vscode-yaml` — which is why it is the first entry in
`.vscode/extensions.json`, ahead of `astro-build.astro-vscode`, which matters
for working on the site but not for writing content. Neither of those two files
carries comments: they are committed JSON and the rest of the repository's JSON
parses as JSON.

Four things about it are deliberate, and each one is load-bearing:

**It is generated.** The interesting fields — `status`, `category`, `impact` —
enumerate ids from `site.config.ts`. A fork that renames `deprecated` to
`sunsetting` gets a schema offering `sunsetting`. A hand-written schema would
have gone on suggesting a value the validator rejects, in a tooltip that looks
authoritative, which is worse than offering nothing at all.

**The output is committed.** An editor reads files from the working tree the
moment a repository is opened; nothing runs a build step first. A `schemas/`
that only existed after `npm run schema` would be missing exactly when it is
wanted. So CI runs `npm run schema -- --check` and fails on drift — that step
exists because the generated-and-committed pair is otherwise only as fresh as
whoever last remembered.

**The objects are closed.** Every object in `src/lib/schema.ts` goes through the
local `strict()` helper, so an unrecognised key is an error and the generated
schema carries `additionalProperties: false`. The point is less the strictness
than the agreement: an editor underlining a field that CI then accepts teaches a
contributor to ignore the editor. What it catches is the failure with no
symptom — `timelien:` on an open object parses, validates, builds and deploys,
and the only trace is dates missing from a page nobody is looking at. The one
key that is allowed everywhere without meaning anything is `$schema`, because
the same language server reads it and a closed object would otherwise reject a
file for pointing at its own schema. A misspelled key inside a `timeline` gets
the list of stages rather than the generic message, which is the second argument
to `strict()`.

**Dates are collapsed to one string.** `dateSchema` is a union of `Date` and
`string`, because YAML hands over an unquoted `2026-01-15` already parsed.
Emitting that union tells an editor a date field accepts any string at all,
which is the one thing it must not say. So `dateSchema` carries
`.meta({ id: 'calendar-date' })` and the generator's `override` swaps the whole
union for a `YYYY-MM-DD` pattern. Two things to know if you touch that callback:
`z.toJSONSchema` throws on a `Date` before `override` ever runs, hence
`unrepresentable: 'any'`; and what `override` is handed is Zod's *core* schema,
which has no `.meta()` — read the id back with `z.globalRegistry.get()`.

If you add a field to `src/lib/schema.ts`, give it a `.describe()`. That string
is the hover text a contributor reads, and a test in
[`scripts/json-schema.test.ts`](../scripts/json-schema.test.ts) fails if a field
arrives without one. Then run `npm run schema` and commit `schemas/` alongside
it.

---

## Styling

Tailwind CSS v4, configured in CSS. There is no `tailwind.config.js`; the plugin
is wired in `astro.config.mjs` and everything else lives in
[`src/styles/global.css`](../src/styles/global.css).

**Tokens.** An `@theme` block defines the surfaces, text, borders, accent and
radii — `--color-canvas`, `--color-surface`, `--color-ink`,
`--color-ink-secondary`, `--color-border-strong`, `--color-accent` and friends.
Those names become Tailwind utilities (`bg-surface`, `text-ink-muted`,
`border-border`).

**Tones.** A second block, `@theme static`, defines eight palettes — gray, blue,
violet, green, amber, red, teal, pink — each with `-bg`, `-border`, `-ink` and
`-solid` variants. `static` matters: components read some of these directly as
`var(--color-tone-*)` in inline styles, which Tailwind's scanner cannot see, and
without it a tone added in `site.config.ts` would render colourless.

The Tone → class mapping is in [`src/lib/tone.ts`](../src/lib/tone.ts), written
out in full rather than interpolated, for the same scanner reason: a constructed
name like `` `bg-tone-${tone}-bg` `` is never generated. If you add a tone, add
it to `TONES` in `site.config.ts`, to both `@theme` blocks in `global.css`, and
to every record in `tone.ts`.

**Dark mode.** An attribute, not a class:

```css
@custom-variant dark (&:where([data-theme='dark'], [data-theme='dark'] *));
```

`:root[data-theme='dark']` then redefines the same variable names with dark
values, so every utility and component switches theme without a single `dark:`
class. The overrides sit inside `@media screen` on purpose — paper is white
whatever your theme is, so print falls through to the light values.

The attribute is seeded **before first paint** by an inline, un-deferred script
in [`BaseLayout.astro`](../src/layouts/BaseLayout.astro), which reads
`localStorage.getItem('signpost-theme')` and falls back to
`prefers-color-scheme`. That script must stay inline and un-deferred or the page
flashes the wrong colours. `ThemeToggle.astro` only handles the click: it flips
`document.documentElement.dataset.theme`, updates its own `aria-label`, and
writes the choice to `localStorage` inside a `try`/`catch` (blocked storage just
means the choice does not persist).

**The rule for components: consume tokens, never raw colours.** No hex value
belongs in a component, because the same component renders in both themes and on
paper. If you need a colour that no token provides, add a token.

**Long-form Markdown** — streamline bodies, update bodies, the guides in `docs/`
— all render inside `.prose`, a component layer at the bottom of `global.css`
covering headings, lists, links, tables, blockquotes and code. It is built from
the same tokens, so it follows the theme like everything else.

Two renderers produce that Markdown, and which one runs depends only on where
the text came from. Anything inside a content file — a streamline's `body`, an
update's `body` — goes through `src/lib/markdown.ts`, which is `marked` with
raw HTML dropped and heading ids added. The guides in `docs/` are the only
thing that goes through Astro's own pipeline, because they are the only thing
that needs a table of contents and the cross-reference plugin. The feeds reuse
the first of those, so a reader sees the same HTML in their feed reader as on
the page.

---

## Adding a page

A route is a file in `src/pages/`. `astro.config.mjs` sets
`build.format: 'directory'` and `trailingSlash: 'always'`, so
`src/pages/foo.astro` is served at `/foo/`.

```astro
---
import BaseLayout from '@/layouts/BaseLayout.astro';
import Container from '@/components/Container.astro';
import PageHeader from '@/components/PageHeader.astro';
import { url } from '@/lib/url';
---

<BaseLayout title="Foo" description="One sentence for the meta description.">
  <PageHeader title="Foo" lede="One sentence for the reader." />
  <Container>
    <a href={url('/roadmap')}>Roadmap</a>
  </Container>
</BaseLayout>
```

`BaseLayout` takes `title` (the site name is appended), `description`, and
optionally `feed` — `{ href, title }` for a page-specific feed, which is emitted
*before* the site-wide one so a browser offers the more specific feed first. It
also supplies the canonical link, the Open Graph tags, "Skip to content" and the
header and footer. `Container` takes `width="wide"` for the roadmap's full-width
grid.

**Always build internal links with `url()`.** The site may be served from a
subpath — a project Pages site at `https://pages.example.com/signpost/` — and
`url()` is what prefixes `BASE_URL`. It also adds the trailing slash unless the
path looks like a file, so `url('/roadmap')` gives `/roadmap/` and
`url('/feed.xml')` stays exactly as written. A hand-written `href="/roadmap/"`
works in development and 404s on every subpath deployment, which is the kind of
bug that only shows up after someone else has adopted the project. `isActive()`
from the same module is what the header uses to mark the current section.

For a dynamic route, export `getStaticPaths()` and pull data from `content.ts`
accessors — see [`src/pages/streamlines/[...id].astro`](../src/pages/streamlines/[...id].astro)
and [`src/pages/teams/[slug].astro`](../src/pages/teams/[slug].astro).

For a non-HTML route, write a `.ts` file exporting
`GET(context: APIContext): Promise<Response>` — see
[`src/pages/feed.xml.ts`](../src/pages/feed.xml.ts).

If the page is top-level, add it to the nav in
[`src/components/Header.astro`](../src/components/Header.astro), which currently
lists Roadmap, Changes, Streamlines, Teams, Guide and About. One array drives
both the desktop nav and the mobile menu, so that is a single edit.

---

## Adding a doc

Drop a Markdown file into `docs/`. There is no list to register it in: the
collection is a flat glob over `docs/*.md`, the page title is the file's own
first `#` heading, and the card on `/docs/` uses its opening paragraph. It
appears at `/docs/<filename>/` on the next build.

Three things follow from these files being read in two places at once — here,
and on GitHub, from the same single copy.

**No frontmatter.** The `docs` collection deliberately has no schema. GitHub
renders a frontmatter block as a table of raw keys at the top of the file, which
is the first thing a reader would see. Title and summary are read out of the
body instead, in [`src/lib/doc-links.ts`](../src/lib/doc-links.ts).

**The page is built around the document, not added to it.** Write the file as
you would write it for GitHub; the page supplies the furniture. The first `# `
heading becomes the title band every other section page on this site has, and is
taken out of the body so the page has one `<h1>`. The `##` and `###` headings
become the contents rail beside the text, which marks the section you are in and
gives each heading a permalink. The opening paragraph is the lede, both on the
page and on the card on `/docs/`, and the length of the file is the "N min read".
Nothing in that list is configured per document, so a new guide arrives with all
of it.

A guide may also write its own `## Contents` list, as two of these do, because a
reader on GitHub has no other way to see the shape of a long file. On the site
that section is hidden: the rail is the same list, in a place where it stays
while you read. Nothing else in a guide is ever hidden.

**Write links as repository paths.** `../site.config.ts`, `adopting.md`,
`#a-section` — whatever is correct for someone reading the file on GitHub. The
site rewrites them on the way out, by four rules:

| A link like | Becomes |
| --- | --- |
| `#a-section` | itself, untouched — heading ids match GitHub's |
| `adopting.md#5-deploy-to-pages` | `/docs/adopting/#5-deploy-to-pages` |
| `../src/pages/roadmap/index.astro` | `/roadmap/` — the view, not its source |
| anything else | a GitHub blob URL for that file |

Only `index.astro` counts as naming a view, because only it stands for exactly
one URL: a link to `[slug].astro` or `feed.xml.ts` is a link to code, and
resolves to the blob like any other file. `CONTRIBUTING.md` is not in `docs/`,
so it is never a page and always resolves to GitHub — which is right, since its
reader is on their way to opening a pull request.

The rules are a pure function in `doc-links.ts`, with the cases pinned down in
`doc-links.test.ts`. They are attached to the Markdown pipeline by
[`src/lib/doc-links-plugin.ts`](../src/lib/doc-links-plugin.ts). That pipeline is
shared with streamline bodies, so the plugin is written as a factory: Sätteri
calls it once per document with the file being compiled, and it returns `false`
for anything that is not a guide — leaving itself out of that document's
pipeline entirely rather than running and doing nothing.

The same plugin also gives every heading its `id`, with the same slugger Astro
uses, so a guide's own `#anchor` links keep working and keep matching GitHub's.
It has to: Astro assigns ids in a later pass, so a permalink written here cannot
read the id it should point at. Astro keeps an id that is already set, and
reports it in the headings it hands the page, so the heading, its permalink and
the rail agree without anything having to be kept in step by hand.

**Tables and code blocks are handled for you.** The same plugin wraps each table
so it scrolls in its own box on a phone instead of dragging the page sideways,
and `.prose` in `global.css` styles both with the site's tokens. Syntax
highlighting is off (`astro.config.mjs`): the default highlighter ships one
fixed palette, which reads as a dark rectangle dropped into a light page.

**After changing `repository` in `site.config.ts`, build with `--force`.** Those
blob URLs are baked in when the Markdown is rendered, and Astro caches a
rendered doc against that file's own digest, under `node_modules/.astro`. Change
the repository and the Markdown has not changed, so the guides are served from
the cache and keep the old URLs while the rest of the site updates — which looks
exactly like a bug in the link rules. `astro build --force` and `astro dev
--force` clear that cache. CI installs from scratch and never sees it.

---

## Feeds

[`src/lib/atom.ts`](../src/lib/atom.ts) writes Atom 1.0 by hand. That is a
deliberate choice over a dependency: the document is small, RFC 4287 is
specific, and a feed library is a lot of surface for `buildAtomFeed()` and
`escapeXml()`. [`src/lib/feeds.ts`](../src/lib/feeds.ts) turns updates into
entries, shared by the site-wide feed and the per-team ones so both are built
the same way.

The part to be careful with is **entry identity**. An entry's `id` is its
permalink — the streamline's URL plus the update's anchor from
[`src/lib/anchor.ts`](../src/lib/anchor.ts), which is
`update-YYYY-MM-DD-<slug-of-title>` built from the **posting** date, because
that is the one date about an update that never changes afterwards. The site
rebuilds nightly; if an id moved, every subscriber's reader would mark old
announcements unread every night. Do not derive an id from anything that can
change — not the effective date, not the stage, not the position in the file.

A malformed feed fails silently: readers simply stop updating and nobody finds
out for months. In place of that missing feedback,
[`src/lib/atom.test.ts`](../src/lib/atom.test.ts) parses every generated
document with a real XML parser (`@xmldom/xmldom`, which throws on anything not
well-formed) and then asserts the elements RFC 4287 requires. If you touch the
feed writer, add a case there rather than a string comparison.

Note the double escaping in `feeds.ts`: entry content is escaped once as HTML
and again as XML by the writer. That is correct, not a bug — the reader unwraps
one layer when it parses the document and the other when it renders the markup.

---

## CI

[`.github/workflows/ci.yml`](../.github/workflows/ci.yml) runs on every pull
request and on pushes to `main`: checkout, `setup-node` with
`node-version-file: .nvmrc` and npm caching, `npm ci`, then **validate → schema
→ check → test → build**, in that order. Content is validated first on purpose,
so that a content mistake is reported as a content mistake rather than surfacing
as a type error or a build failure three steps later. The schema step is
`npm run schema -- --check`, and it fails if `schemas/` no longer matches what
`site.config.ts` and `src/lib/schema.ts` would produce — see
[the third reader is the editor](#the-third-reader-is-the-editor). Concurrency is keyed on the ref with
`cancel-in-progress: true`, so pushing again supersedes the previous run.

## Deploy

[`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml) builds and
publishes to GitHub Pages on merges to `main`. The only part that concerns code:
`actions/configure-pages@v5` supplies `origin` and `base_path`, which the build
receives as the `SITE_URL` and `BASE_PATH` environment variables, and
`astro.config.mjs` reads them into `site` and `base` (falling back to
`http://localhost:4321` and `/` locally). That is the whole mechanism behind the
`url()` rule above. The Pages setup itself — permissions, enabling Pages,
GitHub Enterprise, and the artifact-based alternative for an instance with Pages
disabled — is in [docs/adopting.md](adopting.md#5-deploy-to-pages), not here.

The same workflow runs on a nightly `schedule`, because "today" is baked in at
build time — relative dates, the today marker on the roadmap, and the split
between upcoming and recent changes — so without it a repository nobody merges
to for a fortnight serves a fortnight-old idea of now.

## Announcements

[`.github/workflows/announce.yml`](../.github/workflows/announce.yml) posts what
has changed to Slack on a schedule. It does nothing at all unless an adopter
fills in `announcements` in `site.config.ts` and adds a `SLACK_BOT_TOKEN`
secret, so a fork that merges the file and ignores it is unaffected.

Three modules, split along the line that decides what is testable:

| File | Does | Touches |
| --- | --- | --- |
| [`scripts/announcements.ts`](../scripts/announcements.ts) | works out what is news and writes the sentences | nothing — no disk, no network, no clock |
| [`scripts/slack.ts`](../scripts/slack.ts) | one `chat.postMessage` call | the network |
| [`scripts/announce.ts`](../scripts/announce.ts) | the CLI that joins them up | the disk, the config, the content |

`collectAnnouncements` takes today, the ledger, the lifecycle and the locale as
arguments and returns a list of messages. That is not fastidiousness: the
question that decides whether this feature is usable is "would this run have
sent fifty messages?", and it can only be asked cheaply if the answer does not
depend on the calendar or on a Slack workspace.

**The rule everything else follows from: a streamline the ledger has never seen
announces nothing.** Its keys are recorded and the run moves on. A roadmap of any
age holds dozens of dated things and most of them are in the future, so a
lookback window cannot save a first run — only seeding can. It also makes bulk
imports safe and turns a lost ledger into one quiet day rather than a burst.

The ledger is `announced.json` on the `signpost-state` branch. Keys are
`<streamlineId>#<subject>#<reason>`, three parts so that a later pass can add
deadline reminders (`#t-30`, `#t-7`) without re-keying anything that exists. The
stored value is a fingerprint of what was true when the message went out, which
is what produces "moved from X to Y" rather than a second "added".

**The ordering matters and is easy to get backwards.** A run writes every key it
intends to use into the ledger and pushes that *before* it posts anything. If the
push fails, nothing has been said: a red workflow and a day's delay. The other
order risks saying something and then losing the record of having said it, which
sends the same messages again tomorrow. The cost is that a message which then
fails to post is already written down, so `--send` releases exactly those keys
and the workflow pushes that correction under `if: always()`.

Two things not to change without thinking them through. Messages name dates
rather than states, because `status` and `timeline` are authored separately and a
state claim can contradict the page it links to. And `announce` is
`z.boolean().optional()` rather than defaulted to `true`, because Astro caches
parsed content entries by file digest — a schema default never re-runs for an
unchanged file, so a defaulted boolean is `true` for files somebody has edited
and `undefined` for the rest.

To see what a run would say, without a token and without writing anything:

```bash
npm run announce -- --dry-run
```

---

## What not to hardcode

This repository is forked and rebranded. Every one of these has a helper or a
config field, and reaching past it is the bug class that breaks somebody else's
instance without breaking yours.

| Never write | Use instead |
| --- | --- |
| A stage id (`'deprecated'`, `'retired'`) | `siteConfig.lifecycle`, and the `terminal` / `windingDown` flags for meaning |
| A category or impact id | `siteConfig.categories`, `siteConfig.impactLevels`; `getStage` / `getCategory` / `getImpact` in [`taxonomy.ts`](../src/lib/taxonomy.ts) |
| "the most severe impact level" | Compute it from `weight` — see `topWeight` in [`ChangeRow.astro`](../src/components/ChangeRow.astro) |
| A hex colour or a `dark:` colour class | A token from `global.css`, or a tone via `tone.ts` |
| A leading-slash internal href | `url()` from [`url.ts`](../src/lib/url.ts) |
| `https://github.com/...` | `blobUrl()` / `profileUrl()` from `content.ts`, which follow `siteConfig.repository.url` to a GitHub Enterprise host — the docs link rules are handed the same config for the same reason |
| A hardcoded window (`60`, `30`, quarters) | `attentionWindowDays`, `attentionWeight`, `recentWindowDays`, `roadmapQuarters` |
| A locale-specific date format | The formatters in [`date.ts`](../src/lib/date.ts), which render in UTC at `siteConfig.locale` |
| A stage label in a sentence | Build the sentence from `stage.label` — the validator's messages are the worked example |

When a rule needs to know what a stage *means*, ask the flag (`terminal`,
`windingDown`), never the name. That is the difference between a fork that can
rename its lifecycle and a fork that has to rewrite your code.

---

## Opening a pull request

Run the full gate, keep the diff to one concern, and — if you changed anything a
contributor reads when they get a file wrong — add the test that asserts the new
wording. [CONTRIBUTING.md](../CONTRIBUTING.md#changing-the-site-itself) has the
rest, and the [Code of Conduct](../CODE_OF_CONDUCT.md) applies.
