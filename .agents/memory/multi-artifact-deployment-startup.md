---
name: Multi-artifact health probes
description: Startup failures and recurring base-path probes in multi-artifact VM deployments.
---

Multi-artifact VM deployments can report repeated 500 healthchecks while the web and API processes are still starting. After startup, recurring probes may request an artifact's base path (such as `/api`) even when its explicit startup health path is deeper. A healthy service should answer both paths successfully; a base-path 404 is a real probe failure but does not, by itself, prove the cause of an earlier full-VM outage.

**Why:** The deployment sidecar probes the combined router before all processes are ready, and production logs showed regular base-path requests returning 404 while the explicit health endpoint returned 200. Early 500s can look like a crash even when the services later become healthy.

**How to apply:** Once all artifact ports are open, check the public root, each artifact base path, and its explicit health endpoint. Correlate monitoring outage windows with missing runtime logs or shutdown evidence before attributing a whole-VM outage to a 404 probe.