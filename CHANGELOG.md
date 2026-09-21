# Changelog

What changed in Signpost itself — the site, the scripts, the content format.
Nothing here is about the roadmap a fork publishes; that lives in `content/`.

This file is written by hand, by whoever makes the change, in the same voice as
everything else. It is not generated from commit messages.

The format is [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the
version numbers mean something specific for a fork that merges updates — see
[docs/releasing.md](docs/releasing.md).

## [Unreleased]

**Upgrading:** Nothing to do, unless you forked a fork rather than Signpost
itself. In that case set `template.url` in `site.config.ts` to the repository
you actually forked, or `npm run update` will offer to take its updates from
ours.

### Added

- `npm run update` takes an update from the repository this one was forked
  from. It says what merging would bring before it touches anything — which
  releases you are behind, and the upgrade note each of them carries — then
  merges. `--dry-run` stops after the report. It refuses on a dirty tree, names
  the files on a conflict, and never pushes.
- `template` in `site.config.ts`, optional: where `npm run update` fetches from
  when there is no git remote named `template`. A direct fork leaves it alone.
- The adopting guide says where the fork-and-merge model is going — the engine
  as a dependency, at 1.0 — and what that means for a fork today, which is that
  `content/` and `site.config.ts` are the only two places to edit, because that
  boundary is what a package would later have to keep.

- `npm run release -- 1.2.3` cuts a release: it closes the Unreleased section
  under a dated heading, opens a fresh one, updates the links, sets the version
  in `package.json` and `package-lock.json`, and commits. Pushing and tagging
  stay manual. The steps it replaces are still written down for anyone who
  would rather do them by hand.

## [0.1.0] - 2026-09-20

**Upgrading:** Nothing to do. This is the first release; there is nothing to
merge it into yet.

### Added

- The site: a streamline page per initiative, a changes page across all of
  them, a team directory, and guides rendered from `docs/`.
- Content as YAML under `content/`, with JSON Schemas generated from the same
  definitions the build validates against, so an editor completes and checks the
  fields as they are typed.
- Two validation layers — the schema for shape, `content-rules.ts` for the
  things a schema cannot say — both run in CI and before every build.
- Updates carry a list of what a reader has to do, shown on the page and
  repeated in the feed and the announcement.
- Atom feeds, per team and across everything.
- Slack announcements on a schedule, posting what changed since the last run
  and staying silent in a fork that has not configured them.
- Deployment to GitHub Pages, and a nightly rebuild so relative dates stay true.

[Unreleased]: https://github.com/Anonycoders/signpost/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/Anonycoders/signpost/releases/tag/v0.1.0
