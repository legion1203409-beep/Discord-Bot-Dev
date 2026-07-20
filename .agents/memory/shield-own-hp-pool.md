---
name: Ash Shield own HP pool
description: Shield state lives in two places (participant column + boss state map) and must stay in sync when changing shield mechanics.
---

The Ash Shield has its own HP pool (not mana-backed). Its state is stored in TWO independent places:

- Normal event combat: `event_participants.shield_hp` (persisted via updateParticipant on BOTH the levelup and normal paths; cleared on death).
- Final boss: in-memory `BossState.shieldNext: Map<discordId, {hp, level}>`, serialized to the `active_boss` row.

**Why:** the boss path never touches participant rows, so any shield mechanic change must be applied to both paths or it silently applies to only one (same trap as boss-combat-path-separate).

**How to apply:** when touching shield logic, grep both `shieldHp` (participants) and `shieldNext` (boss map). Boss deserialize tolerates the legacy `string[]` format by dropping those entries — don't remove that filter until old saves are gone.
