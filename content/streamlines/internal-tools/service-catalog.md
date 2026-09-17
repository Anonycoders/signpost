---
title: Service catalog
team: internal-tools
category: internal-tooling
status: generally-available
summary: >-
  The answer to "who owns this service and how do I page them", kept current
  automatically rather than by people remembering to update a wiki page.
owners:
  - name: Deniz Aydin
    github: denizaydin
timeline:
  proposed: 2025-03-03
  in-development: 2025-05-12
  rolling-out: 2025-09-01
  generally-available: 2025-12-01
links:
  - label: Catalog
    url: https://github.com/example-org/service-catalog
  - label: Registering a service
    url: https://github.com/example-org/service-catalog/blob/main/docs/register.md
updates:
  - date: 2026-09-02
    status: generally-available
    impact: info
    title: Ownership now syncs from the staff directory nightly
    body: |
      Services whose owning team no longer exists are flagged rather than left
      pointing at nobody. There are currently 11 of these.
---

## What this is

A registry of every service, its owning team, its dependencies and its on-call
route. Populated from repository metadata, so it stays current without anyone
maintaining it by hand.

## Who this affects

Everyone, occasionally — usually at the worst moment, when something is broken
and you need to find its owner.
