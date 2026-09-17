---
title: Kubernetes 1.31 upgrade
team: devops
category: infrastructure
status: rolling-out
summary: >-
  Cluster-wide upgrade to Kubernetes 1.31. Workloads still using removed beta
  APIs will stop working when their cluster is upgraded.
owners:
  - name: Jana Okafor
    github: janaokafor
  - name: Milan Petrovic
    github: milanp
timeline:
  proposed: 2026-01-15
  in-development: 2026-03-02
  rolling-out: 2026-09-01
  generally-available: 2026-11-16
links:
  - label: Migration guide
    url: https://github.com/example-org/devops-runbooks/blob/main/k8s-1-31.md
  - label: Cluster upgrade schedule
    url: https://github.com/example-org/devops-runbooks/blob/main/k8s-waves.md
updates:
  - date: 2026-09-10
    status: rolling-out
    effective: 2026-10-01
    impact: breaking
    title: Production clusters upgrade from 1 October — Ingress v1beta1 is removed
    body: |
      Production upgrades run in three waves starting **1 October**. Any workload
      still declaring `networking.k8s.io/v1beta1` Ingress objects will fail to
      deploy once its cluster is upgraded.

      Run `kubectl deprecations --context <your-cluster>` to see whether you are
      affected. The migration guide has the before-and-after manifests.
  - date: 2026-09-01
    status: rolling-out
    impact: info
    title: All staging clusters are running 1.31
    body: |
      Staging has been stable for two weeks. This is the window to catch problems
      before the production waves begin.
  - date: 2026-03-02
    status: in-development
    impact: info
    title: Upgrade plan agreed, work has started
---

## Why we are doing this

Our clusters are two minor versions behind upstream support. Staying there means
we stop receiving security patches and cannot adopt the scheduling improvements
that several teams have asked for.

## Who this affects

Every team deploying to a shared cluster. The practical impact is narrow: the
only breaking removal that touches our workloads is the beta Ingress API. Teams
already on the golden path templates are on the supported API and need to do
nothing.

## What we need from you

Check your manifests against the migration guide before **1 October**. If your
service cannot be migrated in time, tell us in `#devops` and we will schedule
your cluster in the final wave.
