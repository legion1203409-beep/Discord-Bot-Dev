---
name: Boss fights use a separate combat path
description: Why combat mechanics must be wired into boss handlers explicitly, not just doCombat
---

Boss fights (event boss + standalone boss) run through `handleFinalBoss` in
`index.ts`, NOT through `doCombat` in `survival.ts`. They share one handler, so
fixing `handleFinalBoss` covers both kinds of boss.

**Rule:** any combat mechanic — Oracle status-effects (blessings/curses via
`getCombatModifiers`/`getRewardMultipliers`), crit, damage multipliers, reward
multipliers — must be wired into the boss path separately, or it silently has no
effect in boss fights even though it works in normal monster combat.

**Reward multipliers** must also be applied in the two boss-*flee* reward paths
in `scheduler.ts` (fireFinalBoss + fireStandaloneBoss escape timers), not just
the defeat path in `index.ts`, or a fighter's gold/xp bonus applies on kill but
not on flee. Defeat and flee are mutually exclusive (defeat sets
`BossState.defeated`; the escape timer checks it), so no double-grant.

`computeBossRewards` returns a fresh `Map<string,{rep,gold,xp}>` of mutable
plain objects — safe to mutate `r.gold`/`r.xp` in place before granting +
displaying so the shown reward matches what's granted.

**Why:** the two combat paths diverged historically; boss damage was a plain
attackBonus roll with no crit/effects. Easy to "fix combat" in `doCombat` and
forget bosses entirely.
