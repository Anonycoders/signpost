---
title: Jenkins pipelines
team: devops
category: infrastructure
status: deprecated
summary: >-
  The previous CI system. Still running for pipelines that have not migrated,
  and switching off for good at the end of March 2027.
owners:
  - name: Milan Petrovic
    github: milanp
timeline:
  proposed: 2020-11-02
  in-development: 2021-01-11
  generally-available: 2021-04-05
  deprecated: 2026-02-16
  retired: 2027-03-31
links:
  - label: Migrating from Jenkins
    url: https://github.com/example-org/devops-runbooks/blob/main/jenkins-migration.md
updates:
  - date: 2026-09-08
    status: deprecated
    impact: action-required
    title: 38 pipelines still to migrate before the March 2027 shutdown
    body: |
      We will contact owning teams individually from October. If your pipeline is
      on the list and you think it should simply be deleted, tell us — that is
      often the right answer for pipelines nobody has run this year.
  - date: 2026-02-16
    status: deprecated
    impact: action-required
    title: Jenkins is deprecated — move to GitHub Actions runners
    body: |
      No new pipelines will be created on Jenkins. Existing ones keep running
      until **31 March 2027**, after which the servers are switched off.
---

## Why this is going away

Two CI systems means two sets of credentials, two sets of agents to patch and
two places to look when a build breaks. The
[self-hosted Actions runners](../devops/github-actions-runners) now cover
everything Jenkins did for us.

## What happens on 31 March 2027

The Jenkins controllers and agents are switched off and the hosts are reclaimed.
Build history will be exported to object storage and kept for two years; there
will be no running UI to browse it.

## What we need from you

Migrate before the date, or tell us your pipeline can be deleted. Both are fine
answers — silence is not.
