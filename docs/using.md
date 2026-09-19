# Reading Signpost

For someone whose team depends on platform work: you want to know what is about
to change, when, and whether it lands on you. You are never going to edit a file
in this repository, and you should not have to.

This guide is written against the sample instance at
[anonycoders.github.io/signpost-sample](https://anonycoders.github.io/signpost-sample/),
published from [`Anonycoders/signpost-sample`](https://github.com/Anonycoders/signpost-sample).
It runs the lifecycle stages, categories and impact levels this project ships by
default in [`site.config.ts`](../site.config.ts). Your organization may have
renamed any of them — the site reads them from config, so the labels you see may
differ from the ones quoted here. The shapes and the rules do not.

If you want to *publish* something rather than read it, you want
[CONTRIBUTING.md](../CONTRIBUTING.md) instead.

---

## Contents

- [The home page, in ten seconds](#the-home-page-in-ten-seconds)
- [The roadmap](#the-roadmap)
- [The changes page](#the-changes-page)
- [Impact levels](#impact-levels)
- [A streamline page](#a-streamline-page)
- [Following it without visiting](#following-it-without-visiting)
- [Theme and printing](#theme-and-printing)

---

## The home page, in ten seconds

The home page exists so that the common case — nothing affects you today —
takes ten seconds to confirm.

**"Needs your attention"** is the first section under the hero, and the only one
that matters when you are in a hurry. The caption next to the heading spells out
the window it covers: on the sample it reads

> Landing within 60 days, or landed in the last 30

Two numbers, because the strip is bounded at both ends. The forward number
(`attentionWindowDays`) is the warning you get before something lands. The
backward number (`recentWindowDays`) is the floor: something that landed last
week is still worth seeing, because you may have been on leave when it did.

What gets in:

- **Announcements only.** The strip is built from updates that teams wrote —
  not from a streamline quietly moving between lifecycle stages. A stage
  transition with nothing written about it is on the roadmap and the changes
  page, not here.
- **At or above an impact threshold.** With the sample's impact levels,
  the threshold (`attentionWeight: 20`) means **Breaking** and **Action
  required** get in and **Info** does not. Teams cannot promote their own
  announcement into this strip by any means other than saying honestly that it
  breaks things or needs action.
- **Sorted by severity first, then by date.** Every **Breaking** item comes
  before every **Action required** one; within a severity, the latest date
  leads. So the top of the strip is the worst thing, not the nearest thing —
  read the dates, not just the order.

If it says

> Nothing is about to break.

then nothing severe enough is landing in the next 60 days or landed in the last
30, and you can close the tab. That is the intended outcome most days.

Below it are three numbers — **Teams**, **Streamlines in flight**, and **Due to
be retired** — each linking to the page behind it. "Due to be retired" counts
things still running that already have a switch-off date, which is the number
worth a second look: it is work somebody has to schedule.

**"Latest from the teams"** is the five most recent announcements at any impact
level, so you can skim what has been going on without the severity filter.

At the top, under the buttons, a line tells you when the site last heard
anything at all:

> Last update posted 10 September 2026. Subscribe to the feed and you will not
> have to come looking.

That date is your staleness check. If it is months old, the site is not
disagreeing with reality — nobody has posted.

---

## The roadmap

[`/roadmap/`](../src/pages/roadmap/index.astro) is every streamline on one
timeline, **grouped by team**, because the question people actually arrive with
is "what is DevOps doing to me this quarter", not "what happens in November".

The window is six quarters wide on the sample: the previous quarter, the
current one, and the next four. The current quarter's header is bold.

### Bars

Each streamline gets one lane. The lane is filled with coloured segments, one
per lifecycle stage the streamline has a date for, each running from the date it
entered that stage to the date it entered the next one. The last stage runs to
the right edge of the window, because something that reached a stage is still in
it. The colours are keyed in the legend directly above the grid — hover any
legend entry for the one-line definition of that stage, for example "Being
adopted in waves. Consuming teams may need to act." for **Rolling out**.

Four things in a lane carry meaning beyond colour:

| What you see | What it means |
| --- | --- |
| A **solid** bar | This stage has started. The dates are history. |
| A **hatched** bar — diagonal stripes | This stage is still in the future. It is a plan, not a fact. |
| A **diamond** ◆ | A dated stage transition that has not happened yet. Hover it: the tooltip reads "Rolling out planned for 1 Oct 2026". |
| A segment with a **square right edge** | It has been cut off, not finished. The next dated stage falls beyond the right-hand edge of the window, so the bar is clipped there. Rounded ends are real ends. |

So a **hatched bar with a diamond on it** is entirely a plan: a stage nobody has
entered yet, with a date the owning team has committed to on the page. Treat the
diamond as the date to put in your calendar and the hatching as the reminder
that it can still move — and that if it moves, it moves on the streamline's own
page, where the update history will say so.

A thin vertical accent line runs down the whole grid at today's date, labelled
in the legend as **"Today, 18 September 2026"**. It only appears when today
falls inside the window.

Two more conventions:

- Streamlines that have reached a terminal stage (**Retired**, on the sample)
  are faded and sorted to the bottom of their team's group. They are
  kept as a record, not hidden.
- A lane reading **"No dates in this window"** is a streamline whose dates all
  fall outside the six quarters shown — usually something that finished long
  ago. Its page still has the full timeline.

On a narrow screen the grid scrolls sideways while the streamline names stay
pinned to the left, rather than compressing six quarters into a phone's width.

### Filters, and sharing a filtered view

Above the grid are three dropdowns — **Team**, **Category** and **Stage** — each
with an **All** option. The line underneath counts what survived: "Showing all
13 streamlines", or "Showing 3 of 13 streamlines". Team groups that end up empty
disappear rather than sitting there as empty headings.

**The filter state lives in the URL.** Choosing a team rewrites the query string
as you go, using `team`, `category` and `status` (and `q` for the search box on
the pages that have one). So

```
/roadmap/?team=devops&status=deprecated
```

is a link you can paste into a ticket, a Slack thread or a bookmark, and whoever
opens it sees exactly the view you were looking at. The dropdowns repopulate
themselves from the URL on load.

Filtering and the theme toggle are the only things on the site that need
JavaScript. With it off, nothing is hidden — you see every streamline instead of
a broken page.

The catalog at [`/streamlines/`](../src/pages/streamlines/index.astro) uses the
same filters plus a search box (placeholder "Title, summary, owner…"), which is
the faster route when you know roughly what you are looking for.

---

## The changes page

[`/changes/`](../src/pages/changes/index.astro) is the chronological view, split
in two.

**"Still to come"** is everything dated in the future, grouped under month
headings, soonest first. When two things land on the same day, the more severe
one is listed first. If it is empty it says "Nothing scheduled."

**"Recently changed"** is the look-back, captioned

> The last 30 days, in case you were away.

which is exactly what it is for.

### Reading a row

Rows come in two kinds.

- **An announcement** somebody wrote. It carries an impact badge — **Breaking**,
  **Action required** or **Info** — a title, and the body the author wrote for
  the people it lands on.
- **A stage transition**, generated from the streamline's timeline. It is badged
  "Moves to Deprecated", carries that stage's one-line description, and links to
  "See the timeline". Nobody wrote it; the dates on the page imply it.

### Two dates on one row

The date column on the left can show two things:

```
1 Oct 2026     ← the day it lands on you
in 2 weeks
announced
10 Sep 2026    ← the day the team posted about it
```

The big date is the day the change actually takes effect, and it is the date the
row is **filed under** — so an announcement written in September about an
October cutover appears in October, where it belongs, and not in the "last 30
days" section a fortnight later.

The smaller "announced" block below it is the posting date, and it is there so
that a row which is clearly old news does not look like it appeared out of
nowhere. If a row shows only one date, the change landed the day it was
announced.

On a streamline's own page the same distinction appears on the update itself, as
a "takes effect 1 October 2026" note next to the posting date.

Announcements at the highest impact level — **Breaking**, on the sample —
are tinted across the full width of the row and given a thick coloured left
border, so one cannot be scrolled past by accident.

---

## Impact levels

Every announcement carries exactly one badge. On the sample:

| Badge | What it means for you |
| --- | --- |
| **Breaking** | "Things will break if you do nothing." |
| **Action required** | "You need to do something, by a date." |
| **Info** | "Good to know. No action needed." |

Those sentences are not a paraphrase — they are the descriptions in
`site.config.ts`, and they appear as the tooltip on the badge itself wherever it
is shown. Hover a badge you are not sure about.

The badge is not only decoration. It decides what reaches the home page's "Needs
your attention" strip, which items lead within a day on the changes page, which
rows get tinted across their full width, and whether a streamline card surfaces
its latest update at all. That is the whole mechanism — there is no separate
"urgent" switch. A team that marks everything **Breaking** to get attention is
making a claim on a page their own name is attached to.

---

## A streamline page

One page per effort, at `/streamlines/<team>/<slug>/`. This is where everything
about one thing lives.

**The stepper** at the top is the lifecycle, showing only the stages this
streamline actually has dates for — the story it had, rather than a row of
stages it skipped. A filled dot with a solid line is a stage it has been
through. **A hollow dot, reached by a dashed line, is a stage that has not
happened yet**: the date under it is a plan. The current stage has a soft ring
around its dot. Under the heading, a line summarises the next move — "Next:
deprecated on 1 March 2027, in 5 months." — or says "No dates planned beyond
today."

**Retirement callouts** sit above everything else when they apply, because they
are the reason this site exists:

- An amber box headed "Being switched off on 1 March 2027", reading "That is in
  5 months. Anything still depending on this needs to move before then."
- Once it has happened, a grey box: "Switched off on 1 March 2027 — This page is
  kept as a record of what happened."

Where a replacement has been declared, both boxes name it and link to it, so the
callout tells you where to go and not only that you have to leave.

**Updates** is the history, newest first, each with its impact badge, the date
it was posted, how long ago that was, and "takes effect" where the two differ.
Each update has its own anchor, so a link from a feed or a ticket lands on the
exact announcement rather than the top of the page.

**The sidebar** answers "who do I ask": the owning team and its channel, named
owners linking to their profile or email, any links the team added (a runbook, a
design doc, a dashboard), and — when one exists — a "Replaced by" or "Replaces"
link to the streamline on the other side of a migration.

At the bottom: **"Edit this page →"**, with the line "Anything wrong or out of
date? Open a pull request — it is one file." If something on the page is wrong,
that link is the fastest route to fixing it, and
[CONTRIBUTING.md](../CONTRIBUTING.md) explains what happens next.

---

## Following it without visiting

Nobody should have to remember to check a roadmap. Everything the site publishes
is also an Atom feed.

| Feed | Address |
| --- | --- |
| Everything | `/feed.xml` |
| One team | `/teams/<team-slug>/feed.xml` |

The team feed is linked from the team's own page as **"Subscribe"** — the
simplest way to get the right URL is to open the team page and copy that link.
Every page also declares the site-wide feed in its `<head>`, and a team page
declares its own feed first, so a browser or reader that auto-detects feeds
offers you the team's feed while you are on the team's page and the whole-site
feed everywhere else.

**In a feed reader** (Feedly, NetNewsWire, Thunderbird, anything): add the URL.
Each entry is titled `Streamline name: update title`, because a reader's list
shows titles alone and "Ingress v1beta1 is removed" on its own says nothing
about what for. The entry opens with a line reading, for example, "**Breaking ·
Kubernetes 1.31 upgrade** — takes effect 1 October 2026", is tagged with the
team, the category and the impact level so you can filter on them in your
reader, is attributed to the streamline's owners, and links straight to that
update on the site rather than to the top of the page.

**In Slack**, a channel can subscribe directly:

```
/feed subscribe https://your-signpost-host/teams/devops/feed.xml
```

**In Microsoft Teams**, add the RSS connector to a channel and give it the same
URL.

One practical caveat for either: Slack and Teams fetch the feed from their own
servers, so this works out of the box for a site on the public internet. If your
instance is behind a VPN or on an internal network, a channel subscription needs
whatever route your organization uses for internal feeds — your platform team
will know. A desktop feed reader on your own machine has no such problem.

Subscribing per team is usually the right granularity: you follow the two or
three teams whose work lands on yours, and skip the rest.

One thing worth knowing: an entry is identified by its permanent link, which is
built from the day the update was posted and its title. That does not change,
so a rebuild of the site — and the site rebuilds nightly — never resurfaces old
announcements as unread. If something appears in your reader, it is new.

---

## Theme and printing

**Theme.** The sun/moon button in the header switches between light and dark and
remembers your choice in this browser; until you touch it, the site follows your
operating system's preference.

**Printing.** Every page has a real print stylesheet, and the roadmap is the one
worth using: the navigation, the filters and the theme toggle drop out, the
sheet turns landscape, the whole timeline is printed rather than the part that
fitted on screen, and the colours are forced through instead of being dropped as
background graphics — which would turn the roadmap into a row of empty outlines.
Cards, change rows and lanes are kept from splitting across two sheets, and the
dark theme is never printed. One known limitation: a roadmap long enough to run
onto a second page does not repeat the quarter headers at the top of it — so
mark the page order before the pages leave the printer.

---

## Something looks wrong

Every streamline and team page ends in a link to the file behind it, and every
team page lists the channel to reach them. A date that has quietly slipped is
worth mentioning to the owning team — the site is only as honest as what they
post to it. If you want to fix it yourself,
[CONTRIBUTING.md](../CONTRIBUTING.md) is the five-minute version.
