import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("discord.js", () => ({
  Client: vi.fn(),
  TextChannel: class TextChannel {},
  ActionRowBuilder: class {
    components: unknown[] = [];
    addComponents(...c: unknown[]) { this.components.push(...c); return this; }
  },
  ButtonBuilder: class {
    data: Record<string, unknown> = {};
    setCustomId(v: string) { this.data.customId = v; return this; }
    setLabel(v: string) { this.data.label = v; return this; }
    setEmoji(v: string) { this.data.emoji = v; return this; }
    setStyle(v: unknown) { this.data.style = v; return this; }
    setDisabled(v: boolean) { this.data.disabled = v; return this; }
  },
  ButtonStyle: { Primary: 1, Secondary: 2, Success: 3, Danger: 4 },
}));

vi.mock("../../lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const mockLoadActiveChest = vi.fn();
const mockClearActiveChest = vi.fn().mockResolvedValue(undefined);
const mockPersistActiveChest = vi.fn().mockResolvedValue(undefined);

vi.mock("../db", () => ({
  loadActiveChest: (...args: unknown[]) => mockLoadActiveChest(...args),
  clearActiveChest: (...args: unknown[]) => mockClearActiveChest(...args),
  persistActiveChest: (...args: unknown[]) => mockPersistActiveChest(...args),
  createEvent: vi.fn(),
  deactivateEvent: vi.fn(),
  getExpiredActiveEvents: vi.fn().mockResolvedValue([]),
  getEventParticipants: vi.fn().mockResolvedValue([]),
  getAllEvents: vi.fn().mockResolvedValue([]),
  setEventDecreeMessage: vi.fn(),
  deleteEvent: vi.fn(),
  getLatestActiveEvent: vi.fn().mockResolvedValue(null),
  getActiveEvent: vi.fn().mockResolvedValue(null),
  setHonorTitle: vi.fn(),
  addPlayerReputation: vi.fn(),
  addPlayerGold: vi.fn(),
  addPlayerXp: vi.fn(),
  persistActiveBoss: vi.fn(),
  loadAllActiveBossRows: vi.fn().mockResolvedValue([]),
  deleteActiveBoss: vi.fn(),
  createActiveBossesTableIfNotExists: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../survival", () => ({
  buildExpiredChestEmbed: vi.fn().mockReturnValue({ type: "expired-embed" }),
  buildStartEmbed: vi.fn().mockReturnValue({}),
  buildExpiredCronica: vi.fn().mockReturnValue({}),
  buildChestEmbed: vi.fn().mockReturnValue({}),
  rollChest: vi.fn().mockReturnValue({ rarity: { key: "bronz", label: "Cufăr de Bronz", emoji: "🪙" }, gold: 20 }),
  oracleMessage: vi.fn().mockReturnValue(""),
  buildFinalBossEmbed: vi.fn().mockReturnValue({}),
  buildBossLeaderboard: vi.fn().mockReturnValue({}),
  buildEventLeaderboard: vi.fn().mockReturnValue({}),
  buildLockedChestEmbed: vi.fn().mockReturnValue({}),
  buildKeyChestEmbed: vi.fn().mockReturnValue({}),
  spawnLockedChest: vi.fn(),
  rollKeyChestType: vi.fn().mockReturnValue("rar"),
  computeBossRewards: vi.fn().mockReturnValue(new Map()),
  finalBossRow: vi.fn().mockReturnValue({}),
  bossMaxHp: vi.fn().mockReturnValue(1000),
  CHEST_RARITIES: [
    { key: "bronz",  label: "Cufăr de Bronz",  emoji: "🪙",  color: 0xcd7f32, min: 10, max: 40,  weight: 58 },
    { key: "argint", label: "Cufăr de Argint", emoji: "🥈",  color: 0xc0c0c0, min: 40, max: 90,  weight: 28 },
  ],
}));

vi.mock("../oracle", () => ({ startOracle: vi.fn(), setOracleExtatic: vi.fn() }));
vi.mock("../oracle-chat", () => ({ maybeReplyAsOracle: vi.fn(), logOracleChatStatus: vi.fn() }));
vi.mock("../combat-events", () => ({ triggerRandomBattleEvent: vi.fn(), getActiveBattleEvent: vi.fn() }));
vi.mock("../status-effects", () => ({ getRewardMultipliers: vi.fn().mockReturnValue({ goldMult: 1, xpMult: 1 }), getCombatModifiers: vi.fn() }));

// ── Import after mocks ─────────────────────────────────────────────────────────

import { rehydrateActiveChest, claimedChests } from "../scheduler";
import { logger } from "../../lib/logger";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeClient(msgExists = true, isTextChannel = true) {
  const msgEdit = vi.fn().mockResolvedValue(undefined);
  const fetchMsg = vi.fn().mockResolvedValue(msgExists ? { edit: msgEdit } : null);
  const fetchChannel = vi.fn().mockResolvedValue(
    isTextChannel
      ? { constructor: { name: "TextChannel" }, messages: { fetch: fetchMsg }, _isTextChannel: true }
      : { _isTextChannel: false },
  );
  return { channels: { fetch: fetchChannel }, _msgEdit: msgEdit };
}

const FUTURE = Date.now() + 60_000;
const PAST   = Date.now() - 1;

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("rehydrateActiveChest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    claimedChests.clear();
    mockLoadActiveChest.mockResolvedValue(null);
  });

  it("returns immediately when no persisted record exists", async () => {
    mockLoadActiveChest.mockResolvedValue(null);
    await rehydrateActiveChest({ channels: { fetch: vi.fn() } } as never);
    expect(mockClearActiveChest).not.toHaveBeenCalled();
  });

  it("calls clearActiveChest and marks chestId claimed when expiry has passed", async () => {
    mockLoadActiveChest.mockResolvedValue({
      messageId: "msg-111",
      channelId: "ch-001",
      chestId: "chest_111_bronz_20",
      gold: 20,
      rarityKey: "bronz",
      expiresAt: PAST,
    });
    const client = makeClient(true, true);
    // Mock TextChannel instanceof check
    const { TextChannel } = await import("discord.js");
    const ch = { constructor: TextChannel, messages: { fetch: vi.fn().mockResolvedValue({ edit: vi.fn().mockResolvedValue(undefined) }) } };
    (client.channels.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(ch);
    Object.setPrototypeOf(ch, TextChannel.prototype);

    await rehydrateActiveChest(client as never);

    expect(mockClearActiveChest).toHaveBeenCalledOnce();
    expect(claimedChests.has("chest_111_bronz_20")).toBe(true);
  });

  it("calls clearActiveChest when the channel is not found", async () => {
    mockLoadActiveChest.mockResolvedValue({
      messageId: "msg-222",
      channelId: "ch-gone",
      chestId: "chest_222_argint_50",
      gold: 50,
      rarityKey: "argint",
      expiresAt: FUTURE,
    });
    await rehydrateActiveChest({ channels: { fetch: vi.fn().mockResolvedValue(null) } } as never);
    expect(mockClearActiveChest).toHaveBeenCalledOnce();
    expect(logger.warn).toHaveBeenCalled();
  });

  it("logs a structured message when clearing a stale expired chest", async () => {
    mockLoadActiveChest.mockResolvedValue({
      messageId: "msg-333",
      channelId: "ch-001",
      chestId: "chest_333_bronz_15",
      gold: 15,
      rarityKey: "bronz",
      expiresAt: PAST,
    });
    const { TextChannel } = await import("discord.js");
    const ch = Object.create(TextChannel.prototype);
    ch.messages = { fetch: vi.fn().mockResolvedValue(null) };
    await rehydrateActiveChest({ channels: { fetch: vi.fn().mockResolvedValue(ch) } } as never);
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ chestId: "chest_333_bronz_15" }),
      expect.stringContaining("restart"),
    );
  });

  it("does not crash and calls clearActiveChest when loadActiveChest returns malformed data", async () => {
    mockLoadActiveChest.mockRejectedValue(new Error("DB error"));
    await rehydrateActiveChest({ channels: { fetch: vi.fn() } } as never);
    expect(logger.error).toHaveBeenCalled();
    expect(mockClearActiveChest).not.toHaveBeenCalled();
  });
});
