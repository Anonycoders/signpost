# Releasing Signpost

For maintainers of this repository, and for anyone running a fork who wants to
know what a version number is telling them.

Signpost is not a package. Nobody installs it: a fork is a copy of this
repository with its own `content/` and its own `site.config.ts`, and taking an
update means merging upstream into that copy — which is what `npm run update`
does, printing the notes below before it touches anything. So a release exists
to answer one question, asked by someone who has just pulled and is looking at a
diff —

> do I have to do anything, or can I merge this and get on with my day?

Everything below is arranged around that question.

---

## Contents

- [What the numbers mean](#what-the-numbers-mean)
- [The changelog](#the-changelog)
- [Making a release](#making-a-release)
- [What the workflow does](#what-the-workflow-does)
- [Cutting a release by hand](#cutting-a-release-by-hand)

---

## What the numbers mean

Semantic versioning, read as a promise to a fork rather than to a package
manager.

| | | |
| --- | --- | --- |
| **MAJOR** | 2.0.0 | You have to do something after merging. |
| **MINOR** | 1.3.0 | Something new. Merge and carry on. |
| **PATCH** | 1.2.4 | A fix. Merge and carry on. |

**MAJOR is the one that costs somebody an afternoon**, so it is the one worth
being strict about. It is not "a big change" — it is a change where merging
alone leaves a fork broken, or leaves it working only because nobody has noticed
yet. In practice that means the content format or the config interface:

- a field in `content/` that is renamed, removed, or newly required
- a change to the shape of `site.config.ts`
- anything that makes a currently valid `content/` directory fail validation

The move from Markdown to YAML content was a MAJOR, and it is the clearest
example: every file in every fork had to be converted, and no amount of care
upstream could have done it for them.

A new component, a new page, a redesign, a new optional field — all MINOR,
however much work they were. The size of the diff is not the measure. What a
fork has to do about it is.

> **While the first number is still 0**, a change that would have been a MAJOR
> bumps the middle one instead: 0.2.0 to 0.3.0. That is the usual reading of
> SemVer for something pre-1.0, and it means the upgrade note is doing the real
> work. It is another reason the note is required rather than optional.

## The changelog

[`CHANGELOG.md`](../CHANGELOG.md) is written by hand, by whoever makes the
change, in the same voice as everything else here. It is not generated from
commit subjects — a generated changelog answers "what was done" when the only
question a fork has is "what does this mean for me", and it would force
`feat:` and `fix:` prefixes onto a history whose whole character is sentences.

A pull request that changes behaviour adds one line under `## [Unreleased]`, in
the category it belongs to. A typo fix does not need one. See
[CONTRIBUTING.md](../CONTRIBUTING.md#changing-the-site-itself).

Every section — including `Unreleased` — carries an upgrade note:

```markdown
**Upgrading:** Nothing to do.
```

```markdown
**Upgrading:** `team:` in every streamline now has to match a file in
`content/teams/`. Run `npm run validate` after merging; it names any that do
not.
```

It sits on `Unreleased` so that the person who makes a breaking change writes
the note while they still know what it costs. Left until release day it becomes
a guess, made by whoever is tagging, about somebody else's change.

The format is [Keep a Changelog](https://keepachangelog.com/en/1.1.0/):
`### Added`, `Changed`, `Deprecated`, `Removed`, `Fixed`, `Security`, and no
others. `npm test` checks all of this, including that every heading has a link
definition at the foot of the file, because the release workflow reads it.

## Making a release

There is no rule about when. When `Unreleased` has enough in it to be worth
somebody's attention, release it; a run of one-line patch releases is noise, and
a year of unreleased changes means the changelog is the only record of anything.

Releasing is one command, then two.

```bash
npm run release -- 1.3.0
```

That closes `Unreleased` under `## [1.3.0]` with today's date in UTC, opens a
fresh `Unreleased` above it, repoints `[Unreleased]` and adds `[1.3.0]` at the
foot of the file, sets the version in `package.json` and `package-lock.json`,
and commits them as `Cut 1.3.0`. Then it prints the notes it is about to publish
and the two commands left:

```bash
git push origin main
git tag -a v1.3.0 -m 'Signpost 1.3.0' && git push origin v1.3.0
```

The push and the tag are deliberately not automated. Everything up to them is
reversible — the cut is one local commit, and `git reset --soft HEAD~1` takes it
back — and everything after them is not.

It refuses rather than guesses. A version that is not newer than the last one, a
version already in the file, an `Unreleased` section with no entries under it (so
running the command twice fails the second time), a changelog that is not valid
to begin with, or uncommitted edits sitting in either file — each stops the cut
with a sentence saying which. Read the printed notes before you tag; that is the
last easy moment to reword them.

The tag carries a `v`; the changelog heading does not. That is the convention
both ends of, and both commands accept either spelling.

> **If `Unreleased` starts collecting merge conflicts**, because several pull
> requests are open at once and all of them append to the same few lines, the
> usual answer is [changesets](https://github.com/changesets/changesets): each
> PR adds its own small file and the tool assembles them at release time. It is
> more machinery than this repository needs today — nothing here is published to
> a package registry, and conflicts in a handful of bullet points are cheap to
> resolve — but it is the escape hatch, and it keeps hand-written notes.

## What the workflow does

[`release.yml`](../.github/workflows/release.yml) runs on any `v*` tag. It takes
the section for that version out of `CHANGELOG.md`, runs the full check suite,
and creates the GitHub Release with those notes as the body.

It publishes nothing it cannot read. A tag with no matching section, a section
with an empty body, a `package.json` version that disagrees with the tag — each
fails the job with a message saying which, and no release is created. Fix the
file, push it, and re-run the job from the Actions tab; the tag stays where it
is.

The checks run again here even though they almost certainly ran on this commit
already, because a tag can be pushed from anywhere, and a release is the one
thing this repository produces that outlives a mistake.

## Cutting a release by hand

`npm run release` only does what a person would do to the file, and a fork
without a working Node setup — or anyone who would simply rather see it — can do
the same edits directly.

1. **Close the section.** Change `## [Unreleased]` to `## [1.3.0] - 2026-09-21`
   with today's date in UTC, and open a fresh empty `## [Unreleased]` above it
   with its own `**Upgrading:** Nothing to do.`

2. **Update the link definitions** at the foot of the file:

   ```markdown
   [Unreleased]: https://github.com/Anonycoders/signpost/compare/v1.3.0...HEAD
   [1.3.0]: https://github.com/Anonycoders/signpost/compare/v1.2.0...v1.3.0
   ```

   A first release has no range to compare against, so it links to its own tag
   page instead: `…/releases/tag/v1.3.0`.

3. **Set the version** in `package.json` to match, and the two that belong to
   this package in `package-lock.json` — the top-level `"version"` and the one
   under `"packages"` at the empty key. Every other `"version"` in that file
   belongs to a dependency. Nothing fails if you skip it; the next
   `npm install` will simply rewrite it and leave you a diff to explain.

4. **Read it back**, exactly as the workflow will:

   ```bash
   npm run --silent release-notes -- v1.3.0
   ```

   That prints the body of the release, or says in words what is wrong with the
   file. `npm test` catches the same problems on a pull request.

Then commit both files together, push, and tag.
