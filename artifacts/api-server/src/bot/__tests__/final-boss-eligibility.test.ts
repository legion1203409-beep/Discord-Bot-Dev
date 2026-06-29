import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Hoist mock references for recordFinalBossHit ──────────────────────────────
const { mockInsertReturning, mockOnConflict } = vi.hoisted(() => {
  const mockInsertReturning = vi.fn();
  const mockOnConflict = vi.fn(() => ({ returning: mockInsertReturning }));
  return { mockInsertReturning, mockOnConflict };
});

// ── Mock @workspace/db ────────────────────────────────────────────────────────
vi.mock("@workspace/db", () => {
  const mockValues = vi.fn(() => ({ onConflictDoNothing: mockOnConflict }));
  const mockInsert = vi.fn(() => ({ values: mockValues }));
  return {
    db: { insert: mockInsert },
    playersTable: {},
    activeEventsTable: {},
    eventParticipantsTable: {},
    eventClaimsTable: { eventId: "eventId", discordId: "discordId" },
    botStateTable: {},
  };
});

// ── Mock drizzle-orm ──────────────────────────────────────────────────────────
vi.mock("drizzle-orm", () => ({
  eq: vi.fn((col: unknown, val: unknown) => `eq(${String(col)},${String(val)})`),
  and: vi.fn((...args: unknown[]) => `and(${args.join(",")})`),
  gte: vi.fn(() => "gte-placeholder"),
  gt: vi.fn(() => "gt-placeholder"),
  inArray: vi.fn(() => "inArray-placeholder"),
  sql: Object.assign(vi.fn((s: unknown) => `sql(${String(s)})`), { empty: "" }),
}));

// ── Mock ../survival ──────────────────────────────────────────────────────────
vi.mock("../survival", () => ({
  CLASSES: {},
  isClassKey: vi.fn(() => false),
  rollRarity: vi.fn(() => "comun"),
  isCompanionKey: vi.fn(() => true),
  companionStats: vi.fn(() => ({ hp: 0, attack: 0, defense: 0, crit: 0 })),
  UPGRADE_DELTA: { atac: 2, def: 2, dodge: 3, crit: 2, hp: 10 },
}));

import { recordFinalBossHit } from "../db";
import { checkBossEligibility, type BossState } from "../scheduler";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeBoss(overrides: Partial<BossState> = {}): BossState {
  return {
    eventId: 1,
    level: 5,
    rarity: "comun",
    maxHp: 10000,
    currentHp: 10000,
    messageId: "msg-1",
    channelId: "channel-1",
    expiresAt: Date.now() + 5 * 60 * 1000,
    lastHitAt: new Map(),
    damageBy: new Map(),
    playerHp: new Map(),
    playerNames: new Map(),
    playerStats: new Map(),
    participants: [{ username: "Alice", discordId: "alice", monsterLevel: 5, totalDamage: 0, isAlive: true }],
    defeated: false,
    ...overrides,
  };
}

// ─── checkBossEligibility ─────────────────────────────────────────────────────

describe("checkBossEligibility — expired event (no boss)", () => {
  it("returns not-ok with reason 'no_boss' when boss is undefined", () => {
    const result = checkBossEligibility(undefined, "alice");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("no_boss");
  });

  it("rejects any uid when boss map entry is missing", () => {
    expect(checkBossEligibility(undefined, "someone-else").ok).toBe(false);
  });
});

describe("checkBossEligibility — already-defeated boss", () => {
  it("returns not-ok with reason 'defeated' when boss.defeated is true", () => {
    const boss = makeBoss({ defeated: true });
    const result = checkBossEligibility(boss, "alice");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("defeated");
  });

  it("rejects even a valid participant when boss is already defeated", () => {
    const boss = makeBoss({ defeated: true });
    const result = checkBossEligibility(boss, "alice");
    expect(result.ok).toBe(false);
  });
});

describe("checkBossEligibility — non-participant", () => {
  it("returns not-ok with reason 'not_participant' for a user not in participants list", () => {
    const boss = makeBoss();
    const result = checkBossEligibility(boss, "unknown-user");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("not_participant");
  });

  it("rejects a user who registered after the boss spawned (not in snapshot)", () => {
    const boss = makeBoss();
    const result = checkBossEligibility(boss, "late-joiner");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("not_participant");
  });
});

describe("checkBossEligibility — dead player", () => {
  it("returns not-ok with reason 'dead' when participant snapshot isAlive is false (died in event before boss spawned)", () => {
    const participants = [{ username: "Alice", discordId: "alice", monsterLevel: 5, totalDamage: 0, isAlive: false }];
    const boss = makeBoss({ participants });
    const result = checkBossEligibility(boss, "alice");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("dead");
  });

  it("rejects an event-dead participant even if they never took boss-fight damage (playerHp not set)", () => {
    const participants = [{ username: "Alice", discordId: "alice", monsterLevel: 5, totalDamage: 0, isAlive: false }];
    const boss = makeBoss({ participants });
    expect(checkBossEligibility(boss, "alice").ok).toBe(false);
  });

  it("returns not-ok with reason 'dead' when player's boss-fight HP is 0 (downed during boss fight)", () => {
    const playerHp = new Map([["alice", 0]]);
    const boss = makeBoss({ playerHp });
    const result = checkBossEligibility(boss, "alice");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("dead");
  });

  it("rejects participant when boss-fight HP is explicitly set to 0", () => {
    const playerHp = new Map([["alice", 0]]);
    const boss = makeBoss({ playerHp });
    expect(checkBossEligibility(boss, "alice").ok).toBe(false);
  });
});

describe("checkBossEligibility — eligible player", () => {
  it("returns ok for a participant whose HP has not been set yet (first hit)", () => {
    const boss = makeBoss();
    const result = checkBossEligibility(boss, "alice");
    expect(result.ok).toBe(true);
  });

  it("returns ok for a participant with HP > 0", () => {
    const playerHp = new Map([["alice", 75]]);
    const boss = makeBoss({ playerHp });
    const result = checkBossEligibility(boss, "alice");
    expect(result.ok).toBe(true);
  });

  it("only checks the requesting uid — other players being dead does not block an alive player", () => {
    const playerHp = new Map([["alice", 0], ["bob", 80]]);
    const participants = [
      { username: "Alice", discordId: "alice", monsterLevel: 5, totalDamage: 0, isAlive: true },
      { username: "Bob", discordId: "bob", monsterLevel: 5, totalDamage: 0, isAlive: true },
    ];
    const boss = makeBoss({ playerHp, participants });
    expect(checkBossEligibility(boss, "bob").ok).toBe(true);
  });

  it("check order: no_boss before defeated before not_participant before dead", () => {
    expect(checkBossEligibility(undefined, "alice").ok).toBe(false);
    const defeatedBoss = makeBoss({ defeated: true });
    expect(checkBossEligibility(defeatedBoss, "unknown").ok).toBe(false);
    if (!checkBossEligibility(defeatedBoss, "unknown").ok) {
      expect((checkBossEligibility(defeatedBoss, "unknown") as { ok: false; reason: string }).reason).toBe("defeated");
    }
  });
});

// ─── recordFinalBossHit — idempotency ─────────────────────────────────────────

describe("recordFinalBossHit — idempotency via onConflictDoNothing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns true on the first claim for a (eventId, discordId) pair", async () => {
    mockInsertReturning.mockResolvedValueOnce([{ eventId: 1, discordId: "alice" }]);

    const result = await recordFinalBossHit(1, "alice");

    expect(result).toBe(true);
  });

  it("returns false on a duplicate claim (onConflictDoNothing returns no row)", async () => {
    mockInsertReturning.mockResolvedValueOnce([]);

    const result = await recordFinalBossHit(1, "alice");

    expect(result).toBe(false);
  });

  it("returns false when the insert throws (DB error)", async () => {
    mockInsertReturning.mockRejectedValueOnce(new Error("connection error"));

    const result = await recordFinalBossHit(1, "alice");

    expect(result).toBe(false);
  });

  it("is independent per player — different discordId gets its own first claim", async () => {
    mockInsertReturning
      .mockResolvedValueOnce([{ eventId: 1, discordId: "alice" }])
      .mockResolvedValueOnce([{ eventId: 1, discordId: "bob" }]);

    expect(await recordFinalBossHit(1, "alice")).toBe(true);
    expect(await recordFinalBossHit(1, "bob")).toBe(true);
  });

  it("is independent per event — same discordId on a different eventId gets its own first claim", async () => {
    mockInsertReturning
      .mockResolvedValueOnce([{ eventId: 1, discordId: "alice" }])
      .mockResolvedValueOnce([{ eventId: 2, discordId: "alice" }]);

    expect(await recordFinalBossHit(1, "alice")).toBe(true);
    expect(await recordFinalBossHit(2, "alice")).toBe(true);
  });

  it("second call for same (eventId, discordId) returns false — no double-reward", async () => {
    mockInsertReturning
      .mockResolvedValueOnce([{ eventId: 1, discordId: "alice" }])
      .mockResolvedValueOnce([]);

    const first = await recordFinalBossHit(1, "alice");
    const second = await recordFinalBossHit(1, "alice");

    expect(first).toBe(true);
    expect(second).toBe(false);
  });
});
