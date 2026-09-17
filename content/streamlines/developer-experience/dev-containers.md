---
title: Standard development containers
team: developer-experience
category: developer-experience
status: in-development
summary: >-
  A reproducible local environment per repository, so a new joiner can run the
  service on their first morning instead of their first week.
owners:
  - name: Sara Lindqvist
    github: saral
timeline:
  proposed: 2026-05-04
  in-development: 2026-07-13
  rolling-out: 2026-11-02
  generally-available: 2027-02-01
updates:
  - date: 2026-09-07
    status: in-development
    impact: info
    title: Pilot with three teams starts this month
    body: |
      Checkout, payments and search are piloting. We are measuring one thing:
      time from `git clone` to a running service with test data.
---

## What this is

A container definition checked into each repository that pins the language
runtime, tooling and local dependencies, and works the same on macOS and Linux.

## Who this affects

Nobody yet — this is in development. When it reaches rollout, adoption will be
opt-in per repository, and the golden path templates will include it by default.
