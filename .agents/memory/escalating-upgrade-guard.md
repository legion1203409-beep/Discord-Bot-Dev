---
name: Escalating upgrade cost guard
description: Atomic DB guard pattern for tier-priced upgrades that consume resources, to stop concurrent double-spend at the same tier.
---

When an upgrade's price is computed from the current level (cost grows per level) and the cost is read in the handler BEFORE the DB write, the UPDATE...WHERE must assert the level matches what the price was based on (`WHERE level_col = expectedLevel`), not just `WHERE gold >= cost`.

**Why:** Two near-simultaneous button clicks both read level N, both compute the level-N price, and without the level guard both UPDATEs succeed — applying two upgrades at the cheaper tier (and skipping/duplicating a tier). Balances never go negative but escalating-cost correctness is violated.

**How to apply:** Pass `expectedLevel` into the upgrade fn; guard with `eq(levelCol, expectedLevel)` plus the `gte(gold, cost)`/`gte(xp, xpCost)` checks. Return null when 0 rows updated and surface a refreshed view / retry message so the UI reflects the new higher tier.
