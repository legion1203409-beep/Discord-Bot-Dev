/**
 * scheduler-boss-escape.test.ts
 *
 * End-to-end (scheduler-level) test for the final-boss escape timer.
 *
 * fireFinalBoss schedules an escape timer (FINAL_BOSS_ACTIVE_MS). When it
 * fires, runFleeResolution distributes rewards via the REAL computeBossRewards
 * and the real getRewardMultipliers wiring. This test fires that timer for a
 * boss whose damageBy map contains both real hitters and zero-damage
 * participants, then asserts the reward DB calls (addPlayerReputation /
 * addPlayerGold / addPlayerXp) land for hitters ONLY — never for participants
 * who appear in the map with 0 damage.
 *
 * Unlike scheduler-dispatch.test.ts (which fully mocks survival), this test
 * uses the REAL survival module so the damage>0 guard is exercised through the
 * actual escape-timer path, not a stub. This locks in the guarantee against a
 * future refactor that bypasses computeBossRewards (e.g. calling addPlayerGold
 * directly or passing a different map).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── Hoisted WeakSet-backed TextChannel so instanceof works across modules ─────
const { MockTextChannel } = vi.hoisted(() => {
  const _instances = new WeakSet<object>();

  class MockTextChannel {
    send     = vi.fn();
    messages = { fetch: vi.fn() };

    constructor() {
      _instances.add(this);
    }

    static [Symbol.hasInstance](obj: unknown): boolean {
      if (obj === null || typeof obj !== "object") return false;
      return _instances.has(obj as object);
    }
  }

  return { MockTextChannel };
});

// ── Mock discord.js (real classes — scheduler/survival use `new`) ─────────────
vi.mock("discord.js", () => {
  class MockEmbedBuilder {
    setColor()       { return this; }
    setTitle()       { return this; }
    setDescription() { return this; }
    setImage()       { return this; }
    setFooter()      { return this; }
    setTimestamp()   { return this; }
    setThumbnail()   { return this; }
    addFields()      { return this; }
  }
  class MockButtonBuilder {
    setCustomId() { return this; }
    setLabel()    { return this; }
    setStyle()    { return this; }
    setEmoji()    { return this; }
    setDisabled() { return this; }
  }
  class MockActionRowBuilder {
    addComponents() { return this; }
  }
  return {
    TextChannel:      MockTextChannel,
    Client:           class MockClient {},
    EmbedBuilder:     MockEmbedBuilder,
    ActionRowBuilder: MockActionRowBuilder,
    ButtonBuilder:    MockButtonBuilder,
    ButtonStyle: { Primary: 1, Secondary: 2, Success: 3, Danger: 4, Link: 5 },
  };
});

// ── Mock logger ───────────────────────────────────────────────────────────────
vi.mock("../lib/logger", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

// ── Mock survival's low-level deps so the REAL survival can be imported ────────
vi.mock("../assets", () => ({
  IMG: { monster: "", death: "", chest: "" },
  COMPANION_IMG: {},
  CHEST_IMG: {},
  KEY_IMG: {},
}));

vi.mock("../combat-events", () => ({
  getActiveBattleEvent: vi.fn(() => null),
  consumeStormDrain: vi.fn(() => 0),
  triggerRandomBattleEvent: vi.fn(),
}));

// getRewardMultipliers returns neutral (×1) multipliers so reward values are
// driven purely by computeBossRewards.
vi.mock("../status-effects", () => ({
  getCombatModifiers: vi.fn(() => ({ critAdd: 0, damageMult: 1, damageTakenMult: 1 })),
  formatActiveEffects: vi.fn(() => null),
  getRewardMultipliers: vi.fn(() => ({ xpMult: 1, goldMult: 1 })),
}));

// NOTE: ../survival is intentionally NOT mocked — we use the real
// computeBossRewards so the escape-timer guard is exercised end-to-end.

// ── Mock DB (capture the reward-writing calls as spies) ───────────────────────
const mockGetActiveEvent       = vi.fn();
const mockGetEventParticipants = vi.fn();
const mockAddPlayerReputation  = vi.fn().mockResolvedValue(undefined);
const mockAddPlayerGold        = vi.fn().mockResolvedValue(undefined);
const mockAddPlayerXp          = vi.fn().mockResolvedValue(undefined);

vi.mock("../db", () => ({
  createEvent:                    vi.fn(),
  deactivateEvent:                vi.fn().mockResolvedValue(undefined),
  getExpiredActiveEvents:         vi.fn().mockResolvedValue([]),
  getEventParticipants:           (...a: unknown[]) => mockGetEventParticipants(...a),
  getAllEvents:                   vi.fn().mockResolvedValue([]),
  setEventDecreeMessage:          vi.fn().mockResolvedValue(undefined),
  deleteEvent:                    vi.fn().mockResolvedValue(undefined),
  getLatestActiveEvent:           vi.fn().mockResolvedValue(null),
  getActiveEvent:                 (...a: unknown[]) => mockGetActiveEvent(...a),
  setHonorTitle:                  vi.fn().mockResolvedValue(undefined),
  addPlayerReputation:            (...a: unknown[]) => mockAddPlayerReputation(...a),
  addPlayerGold:                  (...a: unknown[]) => mockAddPlayerGold(...a),
  addPlayerXp:                    (...a: unknown[]) => mockAddPlayerXp(...a),
  persistActiveBoss:              vi.fn().mockResolvedValue(undefined),
  loadAllActiveBossRows:          vi.fn().mockResolvedValue([]),
  deleteActiveBoss:               vi.fn().mockResolvedValue(undefined),
  createActiveBossesTableIfNotExists: vi.fn().mockResolvedValue(undefined),
  persistActiveChest:             vi.fn().mockResolvedValue(undefined),
  loadActiveChest:                vi.fn().mockResolvedValue(null),
  clearActiveChest:               vi.fn().mockResolvedValue(undefined),
}));

// ── Mock oracle ───────────────────────────────────────────────────────────────
vi.mock("../oracle", () => ({ startOracle: vi.fn(), setOracleExtatic: vi.fn() }));

// ── Import scheduler after all mocks are registered ──────────────────────────
import { fireFinalBoss, activeBossMap } from "../scheduler";

const FINAL_BOSS_ACTIVE_MS = 30 * 60 * 1000;

// ── Helper: build a fresh mock Discord client ─────────────────────────────────
function makeMockClient(): import("discord.js").Client {
  const msg = {
    id:     "mock-boss-msg-id",
    edit:   vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
  };
  const channel = new MockTextChannel();
  channel.send.mockResolvedValue(msg);
  channel.messages.fetch.mockResolvedValue(msg);

  return {
    channels: { fetch: vi.fn().mockResolvedValue(channel) },
  } as unknown as import("discord.js").Client;
}

function makeActiveEvent(eventId: number) {
  // Event must outlive the boss so fireFinalBoss proceeds.
  return { id: eventId, isActive: true, expiresAt: new Date(Date.now() + 2 * FINAL_BOSS_ACTIVE_MS) };
}

// Spawn a boss via fireFinalBoss, then overwrite its damageBy/rarity so the
// escape timer resolves against a known damage distribution.
async function spawnBossWithDamage(
  client: import("discord.js").Client,
  eventId: number,
  damage: [string, number][],
  rarity: "comun" | "rar" | "epic" | "legendar" = "comun",
) {
  mockGetActiveEvent.mockResolvedValueOnce(makeActiveEvent(eventId));
  mockGetEventParticipants.mockResolvedValueOnce(
    damage.map(([discordId], i) => ({
      discordId,
      username: `user-${i}`,
      monsterLevel: 10,
      totalDamage: 0,
      isAlive: true,
      fled: false,
    })),
  );
  await fireFinalBoss(client, eventId);
  const boss = activeBossMap.get(eventId)!;
  boss.damageBy = new Map(damage);
  boss.rarity = rarity;
  for (const [discordId] of damage) {
    boss.playerNames.set(discordId, discordId);
  }
  return boss;
}

// ─────────────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  activeBossMap.clear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("escape timer reward distribution (end-to-end via real computeBossRewards)", () => {
  it("awards rep/gold/xp to hitters only, never to a 0-damage participant", async () => {
    const client = makeMockClient();
    await spawnBossWithDamage(client, 100, [
      ["hitter1", 400],
      ["hitter2", 200],
      ["ghost", 0],
    ]);

    await vi.advanceTimersByTimeAsync(FINAL_BOSS_ACTIVE_MS);

    // Hitters received all three reward types.
    for (const id of ["hitter1", "hitter2"]) {
      expect(mockAddPlayerReputation).toHaveBeenCalledWith(id, expect.any(Number));
      expect(mockAddPlayerGold).toHaveBeenCalledWith(id, expect.any(Number));
      expect(mockAddPlayerXp).toHaveBeenCalledWith(id, expect.any(Number));
    }

    // The 0-damage participant received nothing.
    const calledIds = (spy: typeof mockAddPlayerGold) =>
      spy.mock.calls.map((c) => c[0]);
    expect(calledIds(mockAddPlayerReputation)).not.toContain("ghost");
    expect(calledIds(mockAddPlayerGold)).not.toContain("ghost");
    expect(calledIds(mockAddPlayerXp)).not.toContain("ghost");
  });

  it("calls each reward function exactly once per hitter (no call for the ghost)", async () => {
    const client = makeMockClient();
    await spawnBossWithDamage(client, 101, [
      ["hitter1", 400],
      ["hitter2", 200],
      ["ghost", 0],
    ]);

    await vi.advanceTimersByTimeAsync(FINAL_BOSS_ACTIVE_MS);

    // Two hitters → exactly two calls each, never three.
    expect(mockAddPlayerReputation).toHaveBeenCalledTimes(2);
    expect(mockAddPlayerGold).toHaveBeenCalledTimes(2);
    expect(mockAddPlayerXp).toHaveBeenCalledTimes(2);
  });

  it("never pays out when every participant has 0 damage", async () => {
    const client = makeMockClient();
    await spawnBossWithDamage(client, 102, [
      ["ghost1", 0],
      ["ghost2", 0],
    ]);

    await vi.advanceTimersByTimeAsync(FINAL_BOSS_ACTIVE_MS);

    expect(mockAddPlayerReputation).not.toHaveBeenCalled();
    expect(mockAddPlayerGold).not.toHaveBeenCalled();
    expect(mockAddPlayerXp).not.toHaveBeenCalled();
  });

  it("skips negative-damage entries (defensive guard) but pays real hitters", async () => {
    const client = makeMockClient();
    await spawnBossWithDamage(client, 103, [
      ["hitter", 300],
      ["weird", -50],
    ]);

    await vi.advanceTimersByTimeAsync(FINAL_BOSS_ACTIVE_MS);

    expect(mockAddPlayerGold).toHaveBeenCalledTimes(1);
    expect(mockAddPlayerGold).toHaveBeenCalledWith("hitter", expect.any(Number));
    expect(mockAddPlayerGold.mock.calls.map((c) => c[0])).not.toContain("weird");
  });

  it("gives the top hitter a strictly larger gold reward than a lower-ranked hitter", async () => {
    const client = makeMockClient();
    await spawnBossWithDamage(client, 104, [
      ["top", 1000],
      ["low", 100],
      ["ghost", 0],
    ]);

    await vi.advanceTimersByTimeAsync(FINAL_BOSS_ACTIVE_MS);

    const goldFor = (id: string) =>
      mockAddPlayerGold.mock.calls.find((c) => c[0] === id)?.[1] as number;
    expect(goldFor("top")).toBeGreaterThan(goldFor("low"));
    expect(mockAddPlayerGold.mock.calls.map((c) => c[0])).not.toContain("ghost");
  });

  it("does not re-pay if the boss was already defeated before the timer fired", async () => {
    const client = makeMockClient();
    const boss = await spawnBossWithDamage(client, 105, [
      ["hitter1", 400],
      ["ghost", 0],
    ]);
    // Simulate the boss being killed (e.g. final blow) before the escape timer.
    boss.defeated = true;

    await vi.advanceTimersByTimeAsync(FINAL_BOSS_ACTIVE_MS);

    expect(mockAddPlayerReputation).not.toHaveBeenCalled();
    expect(mockAddPlayerGold).not.toHaveBeenCalled();
    expect(mockAddPlayerXp).not.toHaveBeenCalled();
  });
});
