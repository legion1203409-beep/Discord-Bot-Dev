---
name: Discord publication consistency
description: Resource locking and uncertainty rules for persistent messages and decorative role IDs.
---

Serialize decorative role resolution for the whole guild, not only the individual level threshold.

**Why:** All milestone IDs are saved together. Locks per threshold can avoid duplicate roles at that threshold while still overwriting another simultaneous threshold's saved ID.

**How to apply:** Protect the complete read/create/save cycle for a guild, retain existing IDs, and never let an older queued promotion replace an already-held higher milestone.

Failed history lookup, persisted-ID lookup, message fetch or message edit is uncertainty, not proof that a persistent Discord message is absent.

**Why:** Reposting after transient failures creates duplicate leaderboards and ticket panels. Only a definite deleted-message response establishes that replacement is safe.

**How to apply:** Abort and retry later on uncertain failures; serialize vote settlement through result publication and persistence so timer, click and recovery paths cannot publish independently.

Non-idempotent Discord resource creation must disable the REST client's automatic timeout/5xx retries, not just application retries.

**Why:** discord.js defaults to three transport retries. Discord may create a role/channel but lose the response, so application-level locking and a durable intent alone cannot prevent transport-level duplicates.

**How to apply:** Use a separate shared REST client with retries disabled for guarded creation, persist intent before POST, and reconcile a fresh resource snapshot after uncertainty. Do not change retry settings on the gateway's shared REST client mid-request.

Saved role IDs alone do not prove a role still represents the operator-approved audience.

**Why:** Staff roles can be renamed and repurposed for ordinary members between setup sessions. Reusing such an ID in a new private-channel overwrite can expose staff content.

**How to apply:** Block journaled resources whose live names/types/parents no longer match their recorded identity, and include live names in approval fingerprints so a rename invalidates confirmation.
