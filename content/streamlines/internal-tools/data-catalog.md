---
title: Data catalog
team: internal-tools
category: data
status: in-development
summary: >-
  A searchable index of the datasets we hold: what is in them, who owns them,
  how fresh they are and whether they contain personal data.
owners:
  - name: Deniz Aydin
    github: denizaydin
  - name: Laura Mensah
    github: lauramensah
timeline:
  proposed: 2026-03-16
  in-development: 2026-06-08
  rolling-out: 2026-12-01
  generally-available: 2027-04-01
updates:
  - date: 2026-09-11
    status: in-development
    impact: info
    title: First 40 datasets are indexed
    body: |
      Warehouse tables first; event streams and object storage follow. Personal
      data classification is being reviewed with Legal before anything is opened
      up more widely.
---

## What this is

An index over the warehouse, event streams and shared object storage, with
ownership, freshness and sensitivity classification attached to each dataset.

## Who this affects

Anyone who has asked "is there already a table for this?" and could not find
out. Nothing is required of dataset owners yet; when rollout begins in December
we will ask for classification on datasets we cannot infer.
