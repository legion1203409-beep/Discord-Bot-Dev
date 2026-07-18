/**
 * admin-status-formatters.test.ts
 *
 * Two layers of tests for the /admin status embed:
 *
 * 1. Pure formatting helpers (formatLastMsgStr, formatActivityStatus,
 *    formatMilestoneStr) — extracted from the handler in index.ts so
 *    that refactoring GuildSchedulerState surfaces broken field output.
 *
 * 2. Handler-level integration tests — call handleAdmin with sub=status
 *    and verify the exact embed fields sent via interaction.editReply,
 *    covering: no activity, recent activity, and active boss scenarios.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── Hoisted shared state — accessible before any import ──────────────────────
const { testGuildStates, mockGetGuildActiveBossMap } = vi.hoisted(() => ({
  testGuildStates: new Map<string, { lastActivityAt: number; activityMsgCount: number; [k: string]: unknown }>(),
  mockGetGuildActiveBossMap: vi.fn().mockReturnValue(new Map()),
}));

// ── Mocks — paths relative to this file (src/bot/__tests__/) ─────────────────

vi.mock("discord.js", () => ({
  Client: class { isReady() { return false; } on() {} login() { return Promise.resolve(""); } },
  Guild: class {},
  TextChannel: class {},
  GatewayIntentBits: { Guilds: 1, GuildMessages: 2, GuildMembers: 4, MessageContent: 8 },
  REST: class { setToken() { return this; } put() { return Promise.resolve(); } },
  Routes: { applicationCommands: () => "" },
  Events: {
    MessageCreate: "messageCreate", InteractionCreate: "interactionCreate",
    GuildCreate: "guildCreate", GuildDelete: "guildDelete",
    ClientReady: "ready", ShardReady: "shardReady",
    ShardDisconnect: "shardDisconnect", ShardError: "shardError",
    ShardReconnecting: "shardReconnecting", ShardResume: "shardResume",
  },
  MessageFlags: { Ephemeral: 64 },
  ActivityType: { Watching: 3 },
  SlashCommandBuilder: class {
    setName() { return this; }
    setDescription() { return this; }
    setDefaultMemberPermissions() { return this; }
    addSubcommand() { return this; }
    addSubcommandGroup() { return this; }
    addStringOption() { return this; }
    addUserOption() { return this; }
    addIntegerOption() { return this; }
    addBooleanOption() { return this; }
    toJSON() { return {}; }
  },
  ActionRowBuilder: class { addComponents() { return this; } },
  ButtonBuilder: class {
    setCustomId() { return this; }
    setLabel() { return this; }
    setStyle() { return this; }
    setEmoji() { return this; }
    setDisabled() { return this; }
  },
  StringSelectMenuBuilder: class {
    setCustomId() { return this; }
    setPlaceholder() { return this; }
    addOptions() { return this; }
  },
  EmbedBuilder: class {
    setColor() { return this; }
    setTitle() { return this; }
    setDescription() { return this; }
    setFooter() { return this; }
    setTimestamp() { return this; }
    addFields() { return this; }
  },
  ButtonStyle: { Primary: 1, Secondary: 2, Success: 3, Danger: 4, Link: 5 },
  PermissionFlagsBits: { Administrator: BigInt(8), ModerateMembers: BigInt(1), ManageMessages: BigInt(2) },
  StringSelectMenuInteraction: class {},
}));

vi.mock("../../lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("../alert", () => ({
  sendAlert: vi.fn(),
  sendRecoveryAlert: vi.fn(),
  DISCONNECT_ALERT_THRESHOLD_MS: 300_000,
}));

vi.mock("../scheduler", () => ({
  guildStates: testGuildStates,
  getGuildActiveBossMap: mockGetGuildActiveBossMap,
  isGuildActive: (lastActivityAt: number, windowMs: number, now = Date.now()) =>
    lastActivityAt > 0 && now - lastActivityAt <= windowMs,
  ACTIVITY_WINDOW_MINUTES: 20,
  CHEST_MSG_MILESTONE: 25,
  startGuildScheduler: vi.fn(),
  stopGuildScheduler: vi.fn(),
  APPLICATION_ID: "test-app-id",
  fireEvent: vi.fn(),
  fireChest: vi.fn(),
  fireChestForced: vi.fn(),
  fireFinalBoss: vi.fn(),
  fireLockedChest: vi.fn(),
  fireKeyChest: vi.fn(),
  recordGuildActivity: vi.fn(),
  getGuildClaimedChests: vi.fn().mockReturnValue(new Set()),
  checkBossEligibility: vi.fn(),
  checkBossHitCooldown: vi.fn(),
  BOSS_HIT_COOLDOWN_MS: 30_000,
  checkBossAbilityCooldown: vi.fn(),
  persistBossState: vi.fn(),
}));

vi.mock("../channel-config", () => ({
  getChannel: vi.fn().mockReturnValue(null),
  getAllChannels: vi.fn().mockReturnValue([]),
  setChannel: vi.fn(),
  resetChannel: vi.fn(),
  resetAllChannels: vi.fn(),
  initChannelConfig: vi.fn(),
  hasAnyChannelConfigured: vi.fn().mockReturnValue(false),
  EVENT_LABELS: {},
}));

vi.mock("../oracle", () => ({
  startOracle: vi.fn(),
  setOracleExtatic: vi.fn(),
  recordMessage: vi.fn(),
}));

vi.mock("../oracle-chat", () => ({
  maybeReplyAsOracle: vi.fn(),
  logOracleChatStatus: vi.fn(),
}));

vi.mock("../oracle-guard", () => ({
  handleToxicity: vi.fn().mockResolvedValue(false),
}));

vi.mock("../status-effects", () => ({
  getRewardMultipliers: vi.fn().mockReturnValue({ xpMult: 1, goldMult: 1 }),
  getCombatModifiers: vi.fn().mockReturnValue({}),
  formatActiveEffects: vi.fn().mockReturnValue(""),
  formatCombatEffects: vi.fn().mockReturnValue(""),
  grantGuildBoost: vi.fn(),
  grantAdminPlayerBoost: vi.fn(),
  rollChestEffectKind: vi.fn(),
  grantRandomBlessing: vi.fn(),
  grantRandomCurse: vi.fn(),
  buildChestEffectMessage: vi.fn().mockReturnValue(""),
}));

vi.mock("../oracle-blestem", () => ({
  handleBlestem: vi.fn(),
  handleAdminGhid: vi.fn(),
}));

vi.mock("../constants", () => ({
  SUPER_ADMIN_ID: "super-admin-test",
}));

vi.mock("../db", () => ({
  upsertPlayer: vi.fn(), joinEvent: vi.fn(), getParticipant: vi.fn(),
  updateParticipant: vi.fn(), getActiveEvent: vi.fn().mockResolvedValue(null),
  addPlayerXp: vi.fn(), addPlayerGold: vi.fn(), addPlayerReputation: vi.fn(),
  deductPlayerGold: vi.fn(), deductPlayerXp: vi.fn(), buyPlayerUpgrade: vi.fn(),
  applyUpgradeToActiveParticipant: vi.fn(), getTopPlayers: vi.fn(),
  getGlobalTopPlayers: vi.fn(), getServerRanking: vi.fn(),
  recordPlayerDeath: vi.fn(), recordPlayerRetreat: vi.fn(),
  getPlayerById: vi.fn(), updateMaxLevel: vi.fn(), setPlayerClass: vi.fn(),
  buyCompanion: vi.fn(), upgradeCompanion: vi.fn(), buyAbility: vi.fn(),
  upgradeAbility: vi.fn(), applyAbilityLevelToActiveParticipant: vi.fn(),
  addPlayerKey: vi.fn(), consumePlayerKey: vi.fn(),
  deleteActiveBoss: vi.fn(), clearActiveChest: vi.fn(),
  KEYCHEST_DBKEY: "keychest", LOCKCHEST_DBKEY: "lockchest",
  saveTraderMessageId: vi.fn(), loadTraderMessageId: vi.fn().mockResolvedValue(null),
  clearTraderMessageId: vi.fn(), saveTraderEmbedSig: vi.fn(),
  loadTraderEmbedSig: vi.fn().mockResolvedValue(null),
  ensureBotStateTable: vi.fn(), claimBotInstance: vi.fn(),
  getBotInstanceHolder: vi.fn(),
  runMultiGuildMigrations: vi.fn().mockResolvedValue(undefined),
  resetPlayer: vi.fn(), resetAllPlayersInGuild: vi.fn(), buyPrestige: vi.fn(),
  prestigeXpCost: vi.fn().mockReturnValue(100),
  getPrestigeLevels: vi.fn().mockResolvedValue([]),
  equipTalisman: vi.fn(), tryUpgradeTalismanLevel: vi.fn(),
  tryDeductPlayerGold: vi.fn(), getPlayerTalismans: vi.fn().mockResolvedValue([]),
  saveTalismanLevel: vi.fn(), getPlayerItems: vi.fn().mockResolvedValue([]),
  upgradeClass: vi.fn(), addPlayerItem: vi.fn(), consumePlayerItems: vi.fn(),
  getDailyQuestProgress: vi.fn().mockResolvedValue(null),
  incrementDailyQuestKill: vi.fn(),
  todayDateUTC: vi.fn().mockReturnValue("2026-07-18"),
}));

vi.mock("../survival", () => ({
  doCombat: vi.fn(), buildCombatEmbed: vi.fn().mockReturnValue({}),
  buildResultText: vi.fn().mockReturnValue(""), buildDeathEmbed: vi.fn().mockReturnValue({}),
  buildRetreatEmbed: vi.fn().mockReturnValue({}), prestigeGoldMult: vi.fn().mockReturnValue(1),
  buildShopEmbed: vi.fn().mockReturnValue({}), buildLevelupEmbed: vi.fn().mockReturnValue({}),
  buildProfileEmbed: vi.fn().mockReturnValue({}), buildClassEmbed: vi.fn().mockReturnValue({}),
  classRows: vi.fn().mockReturnValue([]), buildCompanionEmbed: vi.fn().mockReturnValue({}),
  isCompanionKey: vi.fn().mockReturnValue(false), companionStats: vi.fn().mockReturnValue({}),
  combatRow: vi.fn().mockReturnValue({}), shopRows: vi.fn().mockReturnValue([]),
  shopStatsRows: vi.fn().mockReturnValue([]), shopCompRows: vi.fn().mockReturnValue([]),
  shopAbilRows: vi.fn().mockReturnValue([]), shopPrestigeRows: vi.fn().mockReturnValue([]),
  shopClassRows: vi.fn().mockReturnValue([]), levelupRows: vi.fn().mockReturnValue([]),
  shopPrice: vi.fn().mockReturnValue(0), monsterMaxHp: vi.fn().mockReturnValue(1000),
  formatCooldown: vi.fn().mockReturnValue(""), levelTitle: vi.fn().mockReturnValue(""),
  CLASSES: {}, isClassKey: vi.fn().mockReturnValue(false),
  classStats: vi.fn().mockReturnValue({}), classUpgradeCost: vi.fn().mockReturnValue(0),
  isAbilityKey: vi.fn().mockReturnValue(false), upgradeCost: vi.fn().mockReturnValue(0),
  COMPANION_BUY_COST: 0, ABILITY_BUY_COST: 0, UPGRADE_XP_COST: 0,
  SHOP_COUNT_KEY: "shop_count", LEVELUP_INTERVAL: 1000, ABILITY_COOLDOWN_MS: 60_000,
  empowerMult: vi.fn().mockReturnValue(1), shieldReduction: vi.fn().mockReturnValue(0),
  buildFinalBossEmbed: vi.fn().mockReturnValue({}),
  buildBossLeaderboard: vi.fn().mockReturnValue({}),
  buildLockedChestEmbed: vi.fn().mockReturnValue({}),
  buildKeyDropMessage: vi.fn().mockReturnValue(""),
  LOCKED_CHEST_GOLD: 0, spawnLockedChest: vi.fn().mockReturnValue(null),
  rollChest: vi.fn().mockReturnValue({ rarity: { key: "bronz" }, gold: 10 }),
  rollChestMultiplier: vi.fn().mockReturnValue(1),
  computeBossRewards: vi.fn().mockReturnValue([]),
  finalBossRow: vi.fn().mockReturnValue({}), CHEST_RARITIES: [],
  KEY_DROP: {}, CHEST_KEY_REQUIRED: {}, KEY_LABEL: {}, KEY_SOURCE_LABEL: {},
  KEY_EMOJI: {}, buildKeyChestClaimMessage: vi.fn().mockReturnValue(""),
  rollEventKeyDrops: vi.fn().mockReturnValue([]),
  THEME_COLOR: 0x2ecc71, BRAND_FOOTER: { text: "test" },
  buildTalismanPage: vi.fn().mockReturnValue({}),
  shopTalismanRows: vi.fn().mockReturnValue([]),
  shopNavRow2: vi.fn().mockReturnValue({}),
  TALISMANS: {}, TALISMAN_MAX_LEVEL: 3,
  talismanValue: vi.fn().mockReturnValue(0), talismanUpgradeCost: vi.fn().mockReturnValue(0),
  ITEMS: {}, DAILY_QUESTS: [], isTalismanKey: vi.fn().mockReturnValue(false),
  isItemKey: vi.fn().mockReturnValue(false), rollItemDrop: vi.fn().mockReturnValue(null),
  buildMissionEmbed: vi.fn().mockReturnValue({}),
}));

vi.mock("../assets", () => ({ IMG: {} }));

// ── Import the module under test ──────────────────────────────────────────────
import { formatLastMsgStr, formatActivityStatus, formatMilestoneStr, handleAdmin } from "../index";

// ─────────────────────────────────────────────────────────────────────────────

/** Build a minimal mock interaction for /admin status. */
function makeStatusInteraction(guildId = "test-guild-status") {
  return {
    guildId,
    user: { id: "super-admin-test" },
    options: {
      getSubcommand: () => "status" as string,
      getString: () => null,
      getUser: () => null,
      getInteger: () => null,
      getBoolean: () => null,
      getMember: () => null,
      getSubcommandGroup: () => null,
    },
    deferReply: vi.fn().mockResolvedValue(undefined),
    editReply: vi.fn().mockResolvedValue({ id: "msg-1" }),
    reply: vi.fn().mockResolvedValue(undefined),
    followUp: vi.fn().mockResolvedValue(undefined),
  };
}

// ─────────────────────────────────────────────────────────────────────────────

describe("formatLastMsgStr — Discord relative timestamp", () => {
  const NOW = 1_700_000_000_000;

  it("returns 'niciodată (de la pornire)' when lastActivityAt is 0", () => {
    expect(formatLastMsgStr(0, NOW)).toBe("niciodată (de la pornire)");
  });

  it("returns Discord <t:UNIX:R> format for any non-zero lastActivityAt", () => {
    // The second argument (_now) is ignored — Discord renders the age live.
    const ts = 1_699_999_970_000;
    expect(formatLastMsgStr(ts, NOW)).toBe(`<t:${Math.floor(ts / 1000)}:R>`);
  });

  it("uses Math.floor for the unix second conversion (no fractional seconds)", () => {
    const ts = 1_700_000_001_999; // 1_700_000_001.999s → floor → 1_700_000_001
    expect(formatLastMsgStr(ts, NOW)).toBe("<t:1700000001:R>");
  });

  it("_now parameter does not affect output for non-zero lastActivityAt", () => {
    const ts = 1_699_000_000_000;
    expect(formatLastMsgStr(ts, 0)).toBe(formatLastMsgStr(ts, NOW));
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("formatActivityStatus — activity gate label for /admin status", () => {
  const WINDOW_MS = 20 * 60_000;

  it("shows 'Tăcut' when lastActivityAt is 0 (no messages since startup)", () => {
    const status = formatActivityStatus(0, Date.now());
    expect(status).toContain("😴");
    expect(status).toContain("20min");
  });

  it("shows 'Activ' when a message arrived within the 20-minute window", () => {
    const now = Date.now();
    const status = formatActivityStatus(now - 5 * 60_000, now);
    expect(status).toContain("✅");
    expect(status).toContain("Activ");
    expect(status).toContain("20min");
  });

  it("shows 'Activ' exactly at the window boundary", () => {
    const now = Date.now();
    expect(formatActivityStatus(now - WINDOW_MS, now)).toContain("✅");
  });

  it("shows 'Tăcut' one millisecond past the window", () => {
    const now = Date.now();
    const status = formatActivityStatus(now - WINDOW_MS - 1, now);
    expect(status).toContain("😴");
    expect(status).toContain("Tăcut");
  });

  it("shows 'Tăcut' when guild has been silent for 25 minutes", () => {
    const now = Date.now();
    expect(formatActivityStatus(now - 25 * 60_000, now)).toContain("😴");
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("formatMilestoneStr — chest milestone progress", () => {
  it("shows '0/25' when no messages counted yet", () => {
    expect(formatMilestoneStr(0)).toBe("0/25");
  });

  it("shows current count over milestone threshold", () => {
    expect(formatMilestoneStr(12)).toBe("12/25");
  });

  it("shows 24/25 just before milestone triggers", () => {
    expect(formatMilestoneStr(24)).toBe("24/25");
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("handleAdmin status — embed fields from guildStates", () => {
  const GUILD = "test-guild-status-handler";

  beforeEach(() => {
    testGuildStates.clear();
    mockGetGuildActiveBossMap.mockReturnValue(new Map());
  });

  afterEach(() => {
    testGuildStates.clear();
    vi.restoreAllMocks();
  });

  /** Extract a named field from the editReply embed. */
  function getEmbedField(interaction: ReturnType<typeof makeStatusInteraction>, fieldName: string) {
    const call = interaction.editReply.mock.calls[0]?.[0] as { embeds?: Array<{ fields?: Array<{ name: string; value: string }> }> } | undefined;
    return call?.embeds?.[0]?.fields?.find((f) => f.name === fieldName);
  }

  it("shows 'niciodată' and silent label when guild has no activity state", async () => {
    const interaction = makeStatusInteraction(GUILD);
    // no entry in testGuildStates → fallback 0/0
    await handleAdmin(interaction as never);
    expect(interaction.editReply).toHaveBeenCalledOnce();
    expect(getEmbedField(interaction, "💬 Ultimul mesaj")?.value).toBe("niciodată (de la pornire)");
    expect(getEmbedField(interaction, "📊 Activitate server")?.value).toContain("😴");
    expect(getEmbedField(interaction, "🎁 Progres milestone")?.value).toBe("0/25");
  });

  it("shows relative time and active label when guild has recent activity", async () => {
    const now = Date.now();
    testGuildStates.set(GUILD, { lastActivityAt: now - 2 * 60_000, activityMsgCount: 12 });
    const interaction = makeStatusInteraction(GUILD);
    await handleAdmin(interaction as never);
    expect(interaction.editReply).toHaveBeenCalledOnce();
    const lastActivityAt = testGuildStates.get(GUILD)!.lastActivityAt;
    expect(getEmbedField(interaction, "💬 Ultimul mesaj")?.value).toBe(
      `<t:${Math.floor(lastActivityAt / 1000)}:R>`,
    );
    expect(getEmbedField(interaction, "📊 Activitate server")?.value).toContain("✅");
    expect(getEmbedField(interaction, "🎁 Progres milestone")?.value).toBe("12/25");
  });

  it("shows silent label when last message is older than the activity window", async () => {
    const now = Date.now();
    testGuildStates.set(GUILD, { lastActivityAt: now - 25 * 60_000, activityMsgCount: 5 });
    const interaction = makeStatusInteraction(GUILD);
    await handleAdmin(interaction as never);
    expect(getEmbedField(interaction, "📊 Activitate server")?.value).toContain("😴");
    expect(getEmbedField(interaction, "🎁 Progres milestone")?.value).toBe("5/25");
  });

  it("shows active boss info in the Boss field when getGuildActiveBossMap is non-empty", async () => {
    const bossState = {
      eventId: 42,
      currentHp: 8000,
      maxHp: 10000,
      damageBy: new Map([["player-1", 500]]),
    };
    mockGetGuildActiveBossMap.mockReturnValue(new Map([[42, bossState]]));
    const interaction = makeStatusInteraction(GUILD);
    await handleAdmin(interaction as never);
    const bossField = getEmbedField(interaction, "🐉 Boss");
    expect(bossField?.value).toContain("Boss Event #42");
    expect(bossField?.value).toContain("8,000");
    expect(bossField?.value).toContain("10,000");
    expect(bossField?.value).toContain("Luptători: 1");
  });

  it("shows 'Niciun boss activ' when no boss is running", async () => {
    mockGetGuildActiveBossMap.mockReturnValue(new Map());
    const interaction = makeStatusInteraction(GUILD);
    await handleAdmin(interaction as never);
    expect(getEmbedField(interaction, "🐉 Boss")?.value).toContain("Niciun boss activ");
  });
});
