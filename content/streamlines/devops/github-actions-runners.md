---
title: Self-hosted GitHub Actions runners
team: devops
category: infrastructure
status: generally-available
summary: >-
  The supported way to run CI here: autoscaling self-hosted runners with access
  to internal networks, artifact caching and deployment credentials.
owners:
  - name: Milan Petrovic
    github: milanp
timeline:
  proposed: 2025-09-10
  in-development: 2025-11-03
  rolling-out: 2026-02-16
  generally-available: 2026-06-01
supersedes: devops/jenkins-pipelines
links:
  - label: Runner setup guide
    url: https://github.com/example-org/devops-runbooks/blob/main/actions-runners.md
  - label: Migrating from Jenkins
    url: https://github.com/example-org/devops-runbooks/blob/main/jenkins-migration.md
updates:
  - date: 2026-06-01
    status: generally-available
    impact: info
    title: Runners are generally available and are now the default for new repositories
    body: |
      Capacity has been stable through three months of rollout. New repositories
      created from the golden path templates get runner access automatically.
  - date: 2026-02-16
    status: rolling-out
    impact: action-required
    title: Start migrating your pipelines — Jenkins switches off in March 2027
    body: |
      Migration is self-service and most pipelines take under a day. Book time
      with us in `#devops` if yours is unusual.
---

## What this is

Autoscaling runners on our own infrastructure, so CI jobs can reach internal
services and registries that the hosted runners cannot. Capacity scales with
demand and is billed back to the owning team.

## Who this affects

Every team running CI. If you are already on GitHub Actions, you get these
runners by adding a label to your workflow. If you are still on Jenkins, see
[Jenkins pipelines](../devops/jenkins-pipelines) for the retirement date.
