import { describe, it, expect, vi } from "vitest";
import { grantEffect, getCombatModifiers, getRewardMultipliers } from "../status-effects";
import type { EffectDef } from "../status-effects";

// Each test uses a unique ID to avoid cross-test state contamination in the
// shared module-level store.
let idCounter = 0;
function uid(): string { return `test-user-${++idCounter}`; }

function makeEffect(overrides: Partial<EffectDef> & { id: string }): EffectDef {
  return {
    kind: "blessing",
    label: "Test Effect",
    emoji: "⭐",
    flavor: "test",
    durationMs: 10 * 60 * 1000,
    mods: {},
    ...overrides,
  };
}

// ─── getCombatModifiers ────────────────────────────────────────────────────────

describe("getCombatModifiers", () => {
  it("returns neutral defaults when player has no effects", () => {
    const mods = getCombatModifiers(uid());
    expect(mods).toEqual({ critAdd: 0, damageMult: 1, damageTakenMult: 1 });
  });

  it("adds critAdd from a single blessing", () => {
    const id = uid();
    grantEffect(id, makeEffect({ id: "crit_eff", mods: { critAdd: 15 } }));
    const mods = getCombatModifiers(id);
    expect(mods.critAdd).toBe(15);
    expect(mods.damageMult).toBe(1);
    expect(mods.damageTakenMult).toBe(1);
  });

  it("adds critAdd values from multiple effects (additive, not multiplicative)", () => {
    const id = uid();
    grantEffect(id, makeEffect({ id: "crit_a", mods: { critAdd: 10 } }));
    grantEffect(id, makeEffect({ id: "crit_b", mods: { critAdd: 5 } }));
    const mods = getCombatModifiers(id);
    expect(mods.critAdd).toBe(15);
  });

  it("curse critAdd is subtracted (negative value)", () => {
    const id = uid();
    grantEffect(id, makeEffect({ id: "curse_crit", kind: "curse", mods: { critAdd: -10 } }));
    const mods = getCombatModifiers(id);
    expect(mods.critAdd).toBe(-10);
  });

  it("multiplies damageMult from stacked effects (compound)", () => {
    const id = uid();
    grantEffect(id, makeEffect({ id: "dmg_a", mods: { damageMult: 1.1 } }));
    grantEffect(id, makeEffect({ id: "dmg_b", mods: { damageMult: 1.15 } }));
    const mods = getCombatModifiers(id);
    expect(mods.damageMult).toBeCloseTo(1.1 * 1.15);
  });

  it("multiplies damageTakenMult from stacked effects (compound)", () => {
    const id = uid();
    grantEffect(id, makeEffect({ id: "dtr_a", mods: { damageTakenMult: 0.85 } }));
    grantEffect(id, makeEffect({ id: "dtr_b", mods: { damageTakenMult: 1.15 } }));
    const mods = getCombatModifiers(id);
    expect(mods.damageTakenMult).toBeCloseTo(0.85 * 1.15);
  });

  it("ignores xpMult and goldMult (not part of CombatModifiers)", () => {
    const id = uid();
    grantEffect(id, makeEffect({ id: "xp_gold", mods: { xpMult: 1.5, goldMult: 1.2 } }));
    const mods = getCombatModifiers(id);
    expect(mods).toEqual({ critAdd: 0, damageMult: 1, damageTakenMult: 1 });
  });

  it("compound: all three combat mods from one multi-mod effect", () => {
    const id = uid();
    grantEffect(id, makeEffect({ id: "combo", mods: { critAdd: 15, damageMult: 1.15, damageTakenMult: 0.85 } }));
    const mods = getCombatModifiers(id);
    expect(mods.critAdd).toBe(15);
    expect(mods.damageMult).toBeCloseTo(1.15);
    expect(mods.damageTakenMult).toBeCloseTo(0.85);
  });

  it("ignores expired effects (expiry is checked at read time)", () => {
    vi.useFakeTimers();
    try {
      const id = uid();
      grantEffect(id, makeEffect({ id: "expired", durationMs: 5_000, mods: { critAdd: 20 } }));
      vi.advanceTimersByTime(6_000);
      const mods = getCombatModifiers(id);
      expect(mods.critAdd).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("only counts non-expired effects when some have expired and some have not", () => {
    vi.useFakeTimers();
    try {
      const id = uid();
      grantEffect(id, makeEffect({ id: "short_crit", durationMs: 5_000, mods: { critAdd: 20 } }));
      grantEffect(id, makeEffect({ id: "long_dmg",  durationMs: 60_000, mods: { damageMult: 1.1 } }));
      vi.advanceTimersByTime(6_000);
      const mods = getCombatModifiers(id);
      expect(mods.critAdd).toBe(0);
      expect(mods.damageMult).toBeCloseTo(1.1);
    } finally {
      vi.useRealTimers();
    }
  });
});

// ─── getRewardMultipliers ──────────────────────────────────────────────────────

describe("getRewardMultipliers", () => {
  it("returns neutral defaults when player has no effects", () => {
    const mult = getRewardMultipliers(uid());
    expect(mult).toEqual({ xpMult: 1, goldMult: 1 });
  });

  it("applies xpMult from a single blessing", () => {
    const id = uid();
    grantEffect(id, makeEffect({ id: "xp_eff", mods: { xpMult: 1.1 } }));
    const mult = getRewardMultipliers(id);
    expect(mult.xpMult).toBeCloseTo(1.1);
    expect(mult.goldMult).toBe(1);
  });

  it("applies goldMult from a single blessing", () => {
    const id = uid();
    grantEffect(id, makeEffect({ id: "gold_eff", mods: { goldMult: 1.1 } }));
    const mult = getRewardMultipliers(id);
    expect(mult.goldMult).toBeCloseTo(1.1);
    expect(mult.xpMult).toBe(1);
  });

  it("compounds xpMult across multiple effects", () => {
    const id = uid();
    grantEffect(id, makeEffect({ id: "xp_a", mods: { xpMult: 1.1 } }));
    grantEffect(id, makeEffect({ id: "xp_b", mods: { xpMult: 1.1 } }));
    const mult = getRewardMultipliers(id);
    expect(mult.xpMult).toBeCloseTo(1.1 * 1.1);
  });

  it("compounds goldMult across multiple effects", () => {
    const id = uid();
    grantEffect(id, makeEffect({ id: "gold_a", mods: { goldMult: 1.1 } }));
    grantEffect(id, makeEffect({ id: "gold_b", mods: { goldMult: 0.9 } }));
    const mult = getRewardMultipliers(id);
    expect(mult.goldMult).toBeCloseTo(1.1 * 0.9);
  });

  it("curse reduces goldMult below 1", () => {
    const id = uid();
    grantEffect(id, makeEffect({ id: "curse_gold", kind: "curse", mods: { goldMult: 0.9 } }));
    const mult = getRewardMultipliers(id);
    expect(mult.goldMult).toBeCloseTo(0.9);
  });

  it("curse reduces xpMult below 1", () => {
    const id = uid();
    grantEffect(id, makeEffect({ id: "curse_xp", kind: "curse", mods: { xpMult: 0.9 } }));
    const mult = getRewardMultipliers(id);
    expect(mult.xpMult).toBeCloseTo(0.9);
  });

  it("ignores critAdd, damageMult, damageTakenMult (not part of RewardMultipliers)", () => {
    const id = uid();
    grantEffect(id, makeEffect({ id: "combat_only", mods: { critAdd: 15, damageMult: 1.5, damageTakenMult: 0.5 } }));
    const mult = getRewardMultipliers(id);
    expect(mult).toEqual({ xpMult: 1, goldMult: 1 });
  });

  it("ignores expired effects", () => {
    vi.useFakeTimers();
    try {
      const id = uid();
      grantEffect(id, makeEffect({ id: "expired_xp", durationMs: 5_000, mods: { xpMult: 2.0 } }));
      vi.advanceTimersByTime(6_000);
      const mult = getRewardMultipliers(id);
      expect(mult.xpMult).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("cenusa_vie blessing stacks both xpMult and damageMult (only xpMult visible in reward)", () => {
    const id = uid();
    // cenusa_vie: damageMult: 1.15, xpMult: 1.1
    grantEffect(id, makeEffect({ id: "cenusa_vie", mods: { damageMult: 1.15, xpMult: 1.1 } }));
    const mult = getRewardMultipliers(id);
    expect(mult.xpMult).toBeCloseTo(1.1);
    expect(mult.goldMult).toBe(1);
  });
});
