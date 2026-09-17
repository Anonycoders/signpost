---
title: Secret scanning and push protection
team: devops
category: security
status: rolling-out
summary: >-
  Blocks commits containing credentials before they reach a remote branch, and
  flags secrets already in history so they can be rotated.
owners:
  - name: Priya Raman
    github: priyaraman
timeline:
  proposed: 2026-04-07
  in-development: 2026-06-15
  rolling-out: 2026-09-14
  generally-available: 2026-12-01
links:
  - label: What to do when a push is blocked
    url: https://github.com/example-org/devops-runbooks/blob/main/secret-push-blocked.md
updates:
  - date: 2026-09-14
    status: rolling-out
    impact: action-required
    title: Push protection is on for the 20 busiest repositories
    body: |
      If a push is blocked, the message names the file and line. Rotate the
      credential first, then remove it from the commit — do not just force-push
      over it, because the secret is already in the reflog.

      Rolling out to the remaining repositories through October and November.
  - date: 2026-06-15
    status: in-development
    impact: info
    title: Scanning runs in report-only mode across every repository
    body: |
      No pushes are blocked yet. Findings go to the owning team's channel so you
      can start rotating without a deadline hanging over you.
---

## What this is

Two things: scanning existing history for credentials that have leaked, and
blocking new commits that contain them.

## Who this affects

Everyone who pushes code. In practice most teams see nothing — the report-only
phase since June found issues in roughly one repository in six, and those teams
have already been contacted.

## What we need from you

Nothing in advance. When a push is blocked, follow the runbook: rotate, then
clean up.
