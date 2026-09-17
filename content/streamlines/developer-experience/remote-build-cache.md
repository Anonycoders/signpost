---
title: Remote build cache
team: developer-experience
category: developer-experience
status: rolling-out
summary: >-
  A shared cache for build artifacts so CI and local builds stop repeating work
  another machine has already done.
owners:
  - name: Tom Ellis
    github: tomellis
timeline:
  proposed: 2026-02-09
  in-development: 2026-04-13
  rolling-out: 2026-08-17
  generally-available: 2026-11-30
links:
  - label: Enabling the cache
    url: https://github.com/example-org/devex-handbook/blob/main/build-cache.md
updates:
  - date: 2026-09-15
    status: rolling-out
    impact: info
    title: Cache hit rate is 71% across onboarded repositories
    body: |
      Median CI build time on those repositories is down from 11 to 4 minutes.
  - date: 2026-08-17
    status: rolling-out
    impact: action-required
    title: Opt in by adding the cache block to your build configuration
    body: |
      Three lines of configuration, documented in the handbook. Nothing changes
      until you add them.
---

## What this is

A content-addressed cache shared between CI runners and, optionally, local
machines. Builds that have already been done anywhere are fetched rather than
repeated.

## Who this affects

Teams with slow builds, which is where the benefit is concentrated. Adoption is
opt-in and reversible: remove the configuration block and builds go back to how
they were.
