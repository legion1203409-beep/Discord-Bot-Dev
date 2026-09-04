---
name: Artifact production environment scope
description: Production artifact services may not inherit the shared environment block when their run command starts.
---

Required runtime variables for a production artifact service must be declared explicitly in that service's `services.production.run.env`; do not rely on the shared `services.env` block.

**Why:** A published Status VM built successfully but failed readiness because Vite's production run could not find `BASE_PATH`, even though the shared artifact environment defined it. Local reproduction showed the run process exiting before serving HTTP.

**How to apply:** When an artifact's production command validates environment variables at startup, mirror those variables in its production run environment and test the actual production build/serve command.