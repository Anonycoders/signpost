---
title: LLM gateway
team: ai-platform
category: ai
status: rolling-out
summary: >-
  One endpoint for every model we use, with per-team quotas, cost attribution,
  audit logging and failover between providers.
owners:
  - name: Noor Haddad
    github: noorhaddad
  - name: Felix Braun
    github: felixbraun
timeline:
  proposed: 2025-10-06
  in-development: 2026-01-12
  rolling-out: 2026-06-15
  generally-available: 2026-10-19
links:
  - label: Gateway quickstart
    url: https://github.com/example-org/ai-platform-docs/blob/main/gateway.md
  - label: Quota and cost dashboard
    url: https://github.com/example-org/ai-platform-docs/blob/main/quotas.md
updates:
  - date: 2026-09-16
    status: rolling-out
    effective: 2026-11-02
    impact: breaking
    title: Direct provider API keys stop working on 2 November
    body: |
      From **2 November** the provider keys held by individual teams are revoked.
      Calls made directly to a provider will fail with a 401; calls through the
      gateway are unaffected.

      Switching over is a base URL change and a different key. The quickstart has
      the exact diff for each SDK we support.
  - date: 2026-06-15
    status: rolling-out
    impact: action-required
    title: Route your model traffic through the gateway
    body: |
      Teams using models in production should move now rather than in October —
      the gateway gives you retry handling and a cost breakdown you do not
      currently have.
  - date: 2026-01-12
    status: in-development
    impact: info
    title: Gateway is serving its first internal traffic
---

## Why this exists

Model access grew organically: several teams hold their own provider keys, spend
is invisible until the invoice arrives, and there is no shared record of what was
sent to a third party.

## Who this affects

Every team calling a model API. The change is small — a base URL and a key — but
it is mandatory, because the old keys are being revoked.

## What we need from you

Move before **2 November**. If you have a use case the gateway does not cover
yet, raise it in `#ai-platform` now rather than after the cutover.
