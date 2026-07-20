import { describe, it, expect } from "vitest";
import { checkBossAbilityCooldown } from "../scheduler";
import { ABILITY_COOLDOWN_MS } from "../survival";

// ─── checkBossAbilityCooldown — pure cooldown guard ───────────────────────────
//
// `abilityReadyAt` stores the absolute future timestamp at which the ability
// becomes usable again (Date.now() + ABILITY_COOLDOWN_MS at activation).
// Tests inject a fake `now` so no Date.now() mocking is required.

describe("checkBossAbilityCooldown — first use (no prior entry)", () => {
  it("is not on cooldown when the player has never used an ability", () => {
    const abilityReadyAt = new Map<string, number>();
    const result = checkBossAbilityCooldown(abilityReadyAt, "alice");
    expect(result.onCooldown).toBe(false);
  });

  it("treats a missing abilityReadyAt entry as readyAt=0 (always expired)", () => {
    const abilityReadyAt = new Map<string, number>();
    const now = ABILITY_COOLDOWN_MS + 1;
    const result = checkBossAbilityCooldown(abilityReadyAt, "alice", now);
    expect(result.onCooldown).toBe(false);
  });
});

describe("checkBossAbilityCooldown — second click within the window is rejected", () => {
  it("returns onCooldown:true when now is 1ms before readyAt", () => {
    const now = 1_000_000;
    const readyAt = now + ABILITY_COOLDOWN_MS;
    const abilityReadyAt = new Map([["alice", readyAt]]);
    // clicking at now, which is 1ms before the 60-second window expires
    const result = checkBossAbilityCooldown(abilityReadyAt, "alice", readyAt - 1);
    expect(result.onCooldown).toBe(true);
  });

  it("returns onCooldown:true immediately after activation (now === activatedAt)", () => {
    const activatedAt = 1_000_000;
    const readyAt = activatedAt + ABILITY_COOLDOWN_MS;
    const abilityReadyAt = new Map([["alice", readyAt]]);
    const result = checkBossAbilityCooldown(abilityReadyAt, "alice", activatedAt);
    expect(result.onCooldown).toBe(true);
  });

  it("reports remainingSeconds = 60 immediately after activation", () => {
    const activatedAt = 1_000_000;
    const readyAt = activatedAt + ABILITY_COOLDOWN_MS; // +60s
    const abilityReadyAt = new Map([["alice", readyAt]]);
    const result = checkBossAbilityCooldown(abilityReadyAt, "alice", activatedAt);
    expect(result.onCooldown).toBe(true);
    if (result.onCooldown) expect(result.remainingSeconds).toBe(60);
  });

  it("reports remainingSeconds = 1 when 1ms before expiry (ceiling)", () => {
    const activatedAt = 1_000_000;
    const readyAt = activatedAt + ABILITY_COOLDOWN_MS;
    const abilityReadyAt = new Map([["alice", readyAt]]);
    // now = readyAt - 1ms → remaining = 1ms → ceil(1/1000) = 1
    const result = checkBossAbilityCooldown(abilityReadyAt, "alice", readyAt - 1);
    expect(result.onCooldown).toBe(true);
    if (result.onCooldown) expect(result.remainingSeconds).toBe(1);
  });

  it("reports remainingSeconds = 30 at the halfway point (30s remaining)", () => {
    const activatedAt = 1_000_000;
    const readyAt = activatedAt + ABILITY_COOLDOWN_MS;
    const abilityReadyAt = new Map([["alice", readyAt]]);
    // halfway: now = activatedAt + 30_000ms → remaining = 30s
    const result = checkBossAbilityCooldown(abilityReadyAt, "alice", activatedAt + 30_000);
    expect(result.onCooldown).toBe(true);
    if (result.onCooldown) expect(result.remainingSeconds).toBe(30);
  });
});

describe("checkBossAbilityCooldown — click after the cooldown window is accepted", () => {
  it("returns onCooldown:false exactly when readyAt === now", () => {
    const activatedAt = 1_000_000;
    const readyAt = activatedAt + ABILITY_COOLDOWN_MS;
    const abilityReadyAt = new Map([["alice", readyAt]]);
    const result = checkBossAbilityCooldown(abilityReadyAt, "alice", readyAt);
    expect(result.onCooldown).toBe(false);
  });

  it("returns onCooldown:false when now is 1ms past readyAt", () => {
    const activatedAt = 1_000_000;
    const readyAt = activatedAt + ABILITY_COOLDOWN_MS;
    const abilityReadyAt = new Map([["alice", readyAt]]);
    const result = checkBossAbilityCooldown(abilityReadyAt, "alice", readyAt + 1);
    expect(result.onCooldown).toBe(false);
  });

  it("returns onCooldown:false long after readyAt (10 minutes later)", () => {
    const activatedAt = 1_000_000;
    const readyAt = activatedAt + ABILITY_COOLDOWN_MS;
    const abilityReadyAt = new Map([["alice", readyAt]]);
    const result = checkBossAbilityCooldown(abilityReadyAt, "alice", readyAt + 10 * 60 * 1000);
    expect(result.onCooldown).toBe(false);
  });
});

describe("checkBossAbilityCooldown — cooldowns are per-player, not shared", () => {
  it("alice on cooldown does not affect bob (bob has no entry)", () => {
    const now = 1_000_000;
    const abilityReadyAt = new Map([["alice", now + ABILITY_COOLDOWN_MS]]);
    const aliceResult = checkBossAbilityCooldown(abilityReadyAt, "alice", now);
    const bobResult   = checkBossAbilityCooldown(abilityReadyAt, "bob",   now);
    expect(aliceResult.onCooldown).toBe(true);
    expect(bobResult.onCooldown).toBe(false);
  });

  it("two players can be on cooldown independently at different remaining times", () => {
    const base = 1_000_000;
    // alice activated 100s ago → readyAt = base + 200s
    // bob activated 50s ago  → readyAt = base + 250s
    const abilityReadyAt = new Map([
      ["alice", base + 200_000],
      ["bob",   base + 250_000],
    ]);
    const now = base; // both are still on cooldown

    const aliceResult = checkBossAbilityCooldown(abilityReadyAt, "alice", now);
    const bobResult   = checkBossAbilityCooldown(abilityReadyAt, "bob",   now);

    expect(aliceResult.onCooldown).toBe(true);
    if (aliceResult.onCooldown) expect(aliceResult.remainingSeconds).toBe(200);

    expect(bobResult.onCooldown).toBe(true);
    if (bobResult.onCooldown) expect(bobResult.remainingSeconds).toBe(250);
  });

  it("player whose cooldown expired can use again while another is still waiting", () => {
    const base = 1_000_000;
    const abilityReadyAt = new Map([
      ["alice", base - 1],        // readyAt is in the past → free
      ["bob",   base + 60_000],   // readyAt is in the future → on cooldown
    ]);
    const now = base;

    const aliceResult = checkBossAbilityCooldown(abilityReadyAt, "alice", now);
    expect(aliceResult.onCooldown).toBe(false);

    const bobResult = checkBossAbilityCooldown(abilityReadyAt, "bob", now);
    expect(bobResult.onCooldown).toBe(true);
  });
});

describe("checkBossAbilityCooldown — ABILITY_COOLDOWN_MS constant is 60 seconds", () => {
  it("ABILITY_COOLDOWN_MS equals 60_000ms", () => {
    expect(ABILITY_COOLDOWN_MS).toBe(60_000);
  });
});
