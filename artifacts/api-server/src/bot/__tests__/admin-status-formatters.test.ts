/**
 * admin-status-formatters.test.ts
 *
 * Unit tests for the three pure formatting helpers extracted from the
 * /admin status handler in index.ts:
 *   formatLastMsgStr   — human-readable time since last message
 *   formatActivityStatus — active / silent label for the activity gate
 *   formatMilestoneStr  — "N/M" chest milestone progress
 *
 * These tests guard against refactoring GuildSchedulerState (or the
 * handler itself) silently breaking the embed fields shown to admins.
 */

import { describe, it, expect, vi } from "vitest";

// ── Heavy mocks so importing index.ts does not cause side-effects ─────────────

vi.mock("discord.js", () => ({
  Client: class {},
  Guild: class {},
  TextChannel: class {},
  GatewayIntentBits: { Guilds: 1, GuildMessages: 2, GuildMembers: 4, MessageContent: 8 },
  REST: class { setToken() { return this; } put() { return Promise.resolve(); } },
  Routes: { applicationCommands: () => "" },
  Events: { MessageCreate: "messageCreate", InteractionCreate: "interactionCreate", GuildCreate: "guildCreate", GuildDelete: "guildDelete", ClientReady: "ready", ShardReady: "shardReady", ShardDisconnect: "shardDisconnect", ShardError: "shardError", ShardReconnecting: "shardReconnecting", ShardResume: "shardResume" },
  MessageFlags: { Ephemeral: 64 },
  ActivityType: { Watching: 3 },
  SlashCommandBuilder: class { setName() { return this; } setDescription() { return this; } setDefaultMemberPermissions() { return this; } addSubcommand() { return this; } addSubcommandGroup() { return this; } addStringOption() { return this; } addUserOption() { return this; } addIntegerOption() { return this; } addBooleanOption() { return this; } toJSON() { return {}; } },
  ActionRowBuilder: class { addComponents() { return this; } },
  ButtonBuilder: class { setCustomId() { return this; } setLabel() { return this; } setStyle() { return this; } setEmoji() { return this; } setDisabled() { return this; } },
  StringSelectMenuBuilder: class { setCustomId() { return this; } setPlaceholder() { return this; } addOptions() { return this; } },
  EmbedBuilder: class { setColor() { return this; } setTitle() { return this; } setDescription() { return this; } setFooter() { return this; } setTimestamp() { return this; } addFields() { return this; } },
  ButtonStyle: { Primary: 1, Secondary: 2, Success: 3, Danger: 4, Link: 5 },
  PermissionFlagsBits: { ModerateMembers: BigInt(1), ManageMessages: BigInt(2) },
  StringSelectMenuInteraction: class {},
}));

vi.mock("../lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("./alert", () => ({
  sendAlert: vi.fn(),
  sendRecoveryAlert: vi.fn(),
  DISCONNECT_ALERT_THRESHOLD_MS: 300_000,
}));

vi.mock("./scheduler", () => {
  const guildStates = new Map();
  return {
    guildStates,
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
    getGuildActiveBossMap: vi.fn().mockReturnValue(new Map()),
    checkBossEligibility: vi.fn(),
    checkBossHitCooldown: vi.fn(),
    BOSS_HIT_COOLDOWN_MS: 30_000,
    checkBossAbilityCooldown: vi.fn(),
    persistBossState: vi.fn(),
  };
});

vi.mock("./channel-config", () => ({
  getChannel: vi.fn().mockReturnValue(null),
  getAllChannels: vi.fn().mockReturnValue([]),
  setChannel: vi.fn(),
  resetChannel: vi.fn(),
  resetAllChannels: vi.fn(),
  initChannelConfig: vi.fn(),
  hasAnyChannelConfigured: vi.fn().mockReturnValue(false),
  EVENT_LABELS: {},
}));

vi.mock("./oracle", () => ({
  startOracle: vi.fn(),
  setOracleExtatic: vi.fn(),
  recordMessage: vi.fn(),
}));

vi.mock("./oracle-chat", () => ({
  maybeReplyAsOracle: vi.fn(),
  logOracleChatStatus: vi.fn(),
}));

vi.mock("./oracle-guard", () => ({
  handleToxicity: vi.fn().mockResolvedValue(false),
}));

vi.mock("./status-effects", () => ({
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

vi.mock("./oracle-blestem", () => ({
  handleBlestem: vi.fn(),
  handleAdminGhid: vi.fn(),
}));

vi.mock("./constants", () => ({
  SUPER_ADMIN_ID: "super-admin-test",
}));

vi.mock("./db", () => ({
  upsertPlayer: vi.fn(), joinEvent: vi.fn(), getParticipant: vi.fn(),
  updateParticipant: vi.fn(), getActiveEvent: vi.fn(), addPlayerXp: vi.fn(),
  addPlayerGold: vi.fn(), addPlayerReputation: vi.fn(), deductPlayerGold: vi.fn(),
  deductPlayerXp: vi.fn(), buyPlayerUpgrade: vi.fn(),
  applyUpgradeToActiveParticipant: vi.fn(), getTopPlayers: vi.fn(),
  getGlobalTopPlayers: vi.fn(), getServerRanking: vi.fn(),
  recordPlayerDeath: vi.fn(), recordPlayerRetreat: vi.fn(), getPlayerById: vi.fn(),
  updateMaxLevel: vi.fn(), setPlayerClass: vi.fn(), buyCompanion: vi.fn(),
  upgradeCompanion: vi.fn(), buyAbility: vi.fn(), upgradeAbility: vi.fn(),
  applyAbilityLevelToActiveParticipant: vi.fn(), addPlayerKey: vi.fn(),
  consumePlayerKey: vi.fn(), deleteActiveBoss: vi.fn(), clearActiveChest: vi.fn(),
  KEYCHEST_DBKEY: "keychest", LOCKCHEST_DBKEY: "lockchest",
  saveTraderMessageId: vi.fn(), loadTraderMessageId: vi.fn().mockResolvedValue(null),
  clearTraderMessageId: vi.fn(), saveTraderEmbedSig: vi.fn(),
  loadTraderEmbedSig: vi.fn().mockResolvedValue(null), ensureBotStateTable: vi.fn(),
  claimBotInstance: vi.fn(), getBotInstanceHolder: vi.fn(),
  runMultiGuildMigrations: vi.fn().mockResolvedValue(undefined),
  resetPlayer: vi.fn(), resetAllPlayersInGuild: vi.fn(), buyPrestige: vi.fn(),
  prestigeXpCost: vi.fn().mockReturnValue(100), getPrestigeLevels: vi.fn().mockResolvedValue([]),
  equipTalisman: vi.fn(), tryUpgradeTalismanLevel: vi.fn(),
  tryDeductPlayerGold: vi.fn(), getPlayerTalismans: vi.fn().mockResolvedValue([]),
  saveTalismanLevel: vi.fn(), getPlayerItems: vi.fn().mockResolvedValue([]),
  upgradeClass: vi.fn(), addPlayerItem: vi.fn(), consumePlayerItems: vi.fn(),
  getDailyQuestProgress: vi.fn().mockResolvedValue(null),
  incrementDailyQuestKill: vi.fn(), todayDateUTC: vi.fn().mockReturnValue("2026-07-18"),
}));

vi.mock("./survival", () => ({
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

vi.mock("./assets", () => ({ IMG: {} }));

// ── Now import the pure helpers from index.ts ─────────────────────────────────

import { formatLastMsgStr, formatActivityStatus, formatMilestoneStr } from "../index";

// ─────────────────────────────────────────────────────────────────────────────

describe("formatLastMsgStr — time since last message", () => {
  const NOW = 1_700_000_000_000;

  it("returns 'niciodată (de la pornire)' when lastActivityAt is 0", () => {
    expect(formatLastMsgStr(0, NOW)).toBe("niciodată (de la pornire)");
  });

  it("returns seconds format for activity under 60s ago", () => {
    expect(formatLastMsgStr(NOW - 30_000, NOW)).toBe("acum 30s");
  });

  it("returns seconds format at exactly 59s", () => {
    expect(formatLastMsgStr(NOW - 59_000, NOW)).toBe("acum 59s");
  });

  it("returns minutes format for activity between 1 and 59 minutes ago", () => {
    expect(formatLastMsgStr(NOW - 5 * 60_000, NOW)).toBe("acum 5min");
  });

  it("returns minutes format at 59 minutes 59 seconds (last minute before hours)", () => {
    expect(formatLastMsgStr(NOW - 3599_000, NOW)).toBe("acum 59min");
  });

  it("switches to h+min format at exactly 3600 seconds (60 min boundary)", () => {
    expect(formatLastMsgStr(NOW - 3600_000, NOW)).toBe("acum 1h 0min");
  });

  it("returns h+min format for activity over 60 minutes ago", () => {
    expect(formatLastMsgStr(NOW - (2 * 3600 + 15 * 60) * 1000, NOW)).toBe("acum 2h 15min");
  });

  it("returns h+min with 0min when exactly on the hour boundary", () => {
    expect(formatLastMsgStr(NOW - 3 * 3600_000, NOW)).toBe("acum 3h 0min");
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
    const status = formatActivityStatus(now - WINDOW_MS, now);
    expect(status).toContain("✅");
  });

  it("shows 'Tăcut' one millisecond past the window", () => {
    const now = Date.now();
    const status = formatActivityStatus(now - WINDOW_MS - 1, now);
    expect(status).toContain("😴");
    expect(status).toContain("Tăcut");
  });

  it("shows 'Tăcut' when guild has been silent for 25 minutes", () => {
    const now = Date.now();
    const status = formatActivityStatus(now - 25 * 60_000, now);
    expect(status).toContain("😴");
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

  it("shows 0/25 after counter resets at milestone (post-reset value)", () => {
    // After milestone fires, the counter is reset to 0 in recordGuildActivity.
    // The admin command reads activityMsgCount at that moment.
    expect(formatMilestoneStr(0)).toBe("0/25");
  });
});
