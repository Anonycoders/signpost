---
title: Model evaluation harness
team: ai-platform
category: ai
status: in-development
summary: >-
  A shared way to measure whether a prompt or model change actually improved
  anything, before it reaches customers.
owners:
  - name: Felix Braun
    github: felixbraun
timeline:
  proposed: 2026-06-01
  in-development: 2026-08-03
  rolling-out: 2026-12-07
  generally-available: 2027-03-01
updates:
  - date: 2026-08-03
    status: in-development
    impact: info
    title: Harness runs nightly against the shared benchmark set
    body: |
      Two product teams have contributed graded examples. We need more, and from
      more domains — if your team has a task with known-good answers, talk to us.
---

## What this is

A test runner for model-backed features: you define cases and graders, it runs
them on every change and reports a comparison against the previous version.

## Who this affects

Teams shipping features backed by a model. Nothing changes for you until rollout
in December, but contributing evaluation cases now is what makes it useful then.
