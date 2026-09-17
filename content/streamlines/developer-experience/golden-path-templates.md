---
title: Golden path service templates
team: developer-experience
category: developer-experience
status: generally-available
summary: >-
  Starting points for new services that come wired up correctly: CI, logging,
  metrics, health checks and deployment, without copying another team's repo.
owners:
  - name: Tom Ellis
    github: tomellis
  - name: Sara Lindqvist
    github: saral
timeline:
  proposed: 2025-06-02
  in-development: 2025-08-11
  rolling-out: 2025-11-10
  generally-available: 2026-02-02
links:
  - label: Template catalog
    url: https://github.com/example-org/golden-path
updates:
  - date: 2026-07-20
    status: generally-available
    impact: info
    title: Python and Go templates updated to the 2026 baseline
    body: |
      Both templates now ship with the supported Ingress API, so services created
      from them are unaffected by the Kubernetes 1.31 upgrade.
  - date: 2026-02-02
    status: generally-available
    impact: info
    title: Templates are generally available
---

## What this is

`create-service` scaffolds a repository that already builds, deploys, reports
metrics and passes the production readiness checklist. Templates exist for Go,
Python, TypeScript and a plain container.

## Who this affects

Anyone starting something new. Existing services are not required to adopt the
templates, though the same building blocks are available separately.
