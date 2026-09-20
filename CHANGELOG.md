# Changelog

What changed in Signpost itself — the site, the scripts, the content format.
Nothing here is about the roadmap a fork publishes; that lives in `content/`.

This file is written by hand, by whoever makes the change, in the same voice as
everything else. It is not generated from commit messages.

The format is [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the
version numbers mean something specific for a fork that merges updates — see
[docs/releasing.md](docs/releasing.md).

## [Unreleased]

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

[Unreleased]: https://github.com/Anonycoders/signpost/commits/main
