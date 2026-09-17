---
title: Agent execution sandbox
team: ai-platform
category: ai
status: proposed
summary: >-
  An isolated environment where agents can run code and call internal tools
  without holding standing credentials to production systems.
owners:
  - name: Noor Haddad
    github: noorhaddad
timeline:
  proposed: 2026-09-08
  in-development: 2026-11-16
  rolling-out: 2027-03-01
links:
  - label: Proposal and open questions
    url: https://github.com/example-org/ai-platform-docs/blob/main/rfc-agent-sandbox.md
updates:
  - date: 2026-09-08
    status: proposed
    impact: info
    title: Proposal is open for comment until 9 October
    body: |
      We particularly want to hear from teams already running agents against
      internal APIs, and from Security on the credential model.
---

## What is being proposed

A sandbox with no standing access: an agent requests a short-lived, scoped
credential per task, and everything it runs is recorded.

## Status

Proposed only. Scope and timing may change entirely, and it may not be built at
all — the dates below are an estimate, not a commitment.
