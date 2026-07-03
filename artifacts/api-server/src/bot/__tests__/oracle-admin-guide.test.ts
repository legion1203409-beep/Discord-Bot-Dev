import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ─────────────────────────────────────────────────────────────────────
// discord.js — only the subset used by the tested code paths

vi.mock("discord.js", () => ({
  MessageFlags: { Ephemeral: 64 },
  ActivityType: { Watching: 3 },
  PermissionFlagsBits: { Administrator: 8n, ModerateMembers: 268435456n },
  GatewayIntentBits: { Guilds: 1, GuildMessages: 512, GuildVoiceStates: 128 },
  Events: {},
  Client: class { on() { return this; } login() { return Promise.resolve(""); } },
  REST: class { setToken() { return this; } put() { return Promise.resolve([]); } },
  Routes: { applicationGuildCommands: () => "" },
  SlashCommandBuilder: class {
    setName() { return this; }
    setDescription() { return this; }
    addBooleanOption() { return this; }
    addSubcommand() { return this; }
    addUserOption() { return this; }
    addStringOption() { return this; }
    setDefaultMemberPermissions() { return this; }
    toJSON() { return {}; }
  },
  ActionRowBuilder: class { addComponents() { return this; } toJSON() { return {}; } },
  ButtonBuilder: class { setCustomId() { return this; } setLabel() { return this; } setStyle() { return this; } setEmoji() { return this; } setDisabled() { return this; } toJSON() { return {}; } },
  StringSelectMenuBuilder: class { setCustomId() { return this; } setPlaceholder() { return this; } addOptions() { return this; } setMinValues() { return this; } setMaxValues() { return this; } toJSON() { return {}; } },
  EmbedBuilder: class { setColor() { return this; } setTitle() { return this; } setDescription() { return this; } addFields() { return this; } setFooter() { return this; } toJSON() { return {}; } },
  ButtonStyle: { Primary: 1, Secondary: 2, Success: 3, Danger: 4 },
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
  startGuildScheduler: vi.fn(),
  APPLICATION_ID: "app-id-test",
  fireEvent: vi.fn(),
  fireChest: vi.fn(),
  fireChestForced: vi.fn(),
  fireFinalBoss: vi.fn(),
  fireLockedChest: vi.fn(),
  fireKeyChest: vi.fn(),
  getGuildClaimedChests: vi.fn(() => new Set()),
  getGuildActiveBossMap: vi.fn(() => new Map()),
  checkBossEligibility: vi.fn().mockResolvedValue(true),
  checkBossHitCooldown: vi.fn().mockResolvedValue(true),
  BOSS_HIT_COOLDOWN_MS: 30_000,
  checkBossAbilityCooldown: vi.fn().mockResolvedValue(true),
  persistBossState: vi.fn(),
}));

vi.mock("../oracle", () => ({ recordMessage: vi.fn() }));

vi.mock("../oracle-chat", () => ({
  maybeReplyAsOracle: vi.fn(),
  logOracleChatStatus: vi.fn(),
}));

vi.mock("../oracle-guard", () => ({ handleToxicity: vi.fn() }));

vi.mock("../status-effects", () => ({
  getRewardMultipliers: vi.fn().mockReturnValue({ goldMult: 1, xpMult: 1 }),
  getCombatModifiers: vi.fn().mockReturnValue({ critBonus: 0, shieldMult: 1, dmgBonus: 0 }),
  formatActiveEffects: vi.fn().mockReturnValue(""),
  grantRandomCurse: vi.fn(),
  clearCurses: vi.fn(),
}));

const mockHandleAdminGhid = vi.fn().mockResolvedValue(undefined);
vi.mock("../oracle-blestem", () => ({
  handleBlestem: vi.fn(),
  handleAdminGhid: (...args: unknown[]) => mockHandleAdminGhid(...args),
}));

vi.mock("../db", () => ({
  upsertPlayer: vi.fn(),
  joinEvent: vi.fn(),
  getParticipant: vi.fn(),
  updateParticipant: vi.fn(),
  getActiveEvent: vi.fn(),
  addPlayerXp: vi.fn(),
  addPlayerGold: vi.fn(),
  addPlayerReputation: vi.fn(),
  deductPlayerGold: vi.fn(),
  buyPlayerUpgrade: vi.fn(),
  applyUpgradeToActiveParticipant: vi.fn(),
  getTopPlayers: vi.fn().mockResolvedValue([]),
  recordPlayerDeath: vi.fn(),
  recordPlayerRetreat: vi.fn(),
  getPlayerById: vi.fn(),
  updateMaxLevel: vi.fn(),
  setPlayerClass: vi.fn(),
  buyCompanion: vi.fn(),
  upgradeCompanion: vi.fn(),
  buyAbility: vi.fn(),
  upgradeAbility: vi.fn(),
  applyAbilityLevelToActiveParticipant: vi.fn(),
  addPlayerKey: vi.fn(),
  consumePlayerKey: vi.fn(),
  deleteActiveBoss: vi.fn(),
  clearActiveChest: vi.fn(),
  KEYCHEST_DBKEY: "keychest",
  LOCKCHEST_DBKEY: "lockchest",
  saveTraderMessageId: vi.fn(),
  loadTraderMessageId: vi.fn(),
  clearTraderMessageId: vi.fn(),
  saveTraderEmbedSig: vi.fn(),
  loadTraderEmbedSig: vi.fn(),
  ensureBotStateTable: vi.fn(),
  runMultiGuildMigrations: vi.fn(),
  getLatestActiveEvent: vi.fn(),
  getGlobalTopPlayers: vi.fn().mockResolvedValue([]),
}));

vi.mock("../survival", () => ({
  doCombat: vi.fn(),
  buildCombatEmbed: vi.fn().mockReturnValue({}),
  buildResultText: vi.fn().mockReturnValue(""),
  buildDeathEmbed: vi.fn().mockReturnValue({}),
  buildRetreatEmbed: vi.fn().mockReturnValue({}),
  buildShopEmbed: vi.fn().mockReturnValue({}),
  buildLevelupEmbed: vi.fn().mockReturnValue({}),
  buildProfileEmbed: vi.fn().mockReturnValue({}),
  buildClassEmbed: vi.fn().mockReturnValue({}),
  classRows: vi.fn().mockReturnValue([]),
  buildCompanionEmbed: vi.fn().mockReturnValue({}),
  isCompanionKey: vi.fn().mockReturnValue(false),
  combatRow: vi.fn().mockReturnValue({}),
  shopRows: vi.fn().mockReturnValue([]),
  shopStatsRows: vi.fn().mockReturnValue([]),
  shopCompRows: vi.fn().mockReturnValue([]),
  shopAbilRows: vi.fn().mockReturnValue([]),
  levelupRows: vi.fn().mockReturnValue([]),
  shopPrice: vi.fn().mockReturnValue(100),
  monsterMaxHp: vi.fn().mockReturnValue(100),
  formatCooldown: vi.fn().mockReturnValue(""),
  levelTitle: vi.fn().mockReturnValue(""),
  CLASSES: {},
  isClassKey: vi.fn().mockReturnValue(false),
  isAbilityKey: vi.fn().mockReturnValue(false),
  upgradeCost: vi.fn().mockReturnValue(100),
  COMPANION_BUY_COST: 500,
  ABILITY_BUY_COST: 300,
  UPGRADE_XP_COST: 50,
  SHOP_COUNT_KEY: "shop_count",
  LEVELUP_INTERVAL: 10,
  ABILITY_COOLDOWN_MS: 60_000,
  empowerMult: vi.fn().mockReturnValue(1),
  shieldReduction: vi.fn().mockReturnValue(0),
  buildFinalBossEmbed: vi.fn().mockReturnValue({}),
  buildBossLeaderboard: vi.fn().mockReturnValue(""),
  buildLockedChestEmbed: vi.fn().mockReturnValue({}),
  buildKeyDropMessage: vi.fn().mockReturnValue({}),
  LOCKED_CHEST_GOLD: 500,
  spawnLockedChest: vi.fn(),
  rollChest: vi.fn().mockReturnValue({ rarity: { key: "comun" } }),
  rollChestMultiplier: vi.fn().mockReturnValue(1),
  computeBossRewards: vi.fn().mockReturnValue([]),
  finalBossRow: vi.fn().mockReturnValue({}),
  CHEST_RARITIES: {},
  KEY_DROP: {},
  CHEST_KEY_REQUIRED: {},
  KEY_LABEL: {},
  KEY_SOURCE_LABEL: {},
  KEY_EMOJI: {},
  buildKeyChestClaimMessage: vi.fn().mockReturnValue({}),
  rollEventKeyDrops: vi.fn().mockReturnValue([]),
  THEME_COLOR: 0x8a4a2f,
  BRAND_FOOTER: "Regatul Cenușii — Cronica Umbrelor",
}));

// ── Import after mocks ─────────────────────────────────────────────────────────

import { handleAdmin } from "../index";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeAdminInteraction({
  sub,
  userId = "admin-999",
  guildOwnerId = "guild-owner-111",
}: {
  sub: string;
  userId?: string;
  guildOwnerId?: string;
}) {
  const reply = vi.fn().mockResolvedValue(undefined);
  return {
    reply,
    user: { id: userId },
    guild: { ownerId: guildOwnerId },
    options: {
      getSubcommand: vi.fn().mockReturnValue(sub),
    },
    _reply: reply,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("/admin ghid — non-owner admin access", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHandleAdminGhid.mockResolvedValue(undefined);
  });

  it("routes to handleAdminGhid without going through isOwner", async () => {
    const interaction = makeAdminInteraction({ sub: "ghid", userId: "admin-999", guildOwnerId: "guild-owner-111" });
    await handleAdmin(interaction as never);
    // handleAdminGhid was called — non-owner did NOT get the restriction reply
    expect(mockHandleAdminGhid).toHaveBeenCalledOnce();
    expect(mockHandleAdminGhid).toHaveBeenCalledWith(interaction);
    // The blocking reply ("Doar creatorul") must NOT have been sent
    expect(interaction._reply).not.toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining("Doar creatorul") }),
    );
  });

  it("handleAdminGhid embed contains justice trigger phrases ('fa dreptate', 'judeca-i')", async () => {
    const { handleAdminGhid: realGhid } = await vi.importActual("../oracle-blestem") as typeof import("../oracle-blestem");
    const reply = vi.fn().mockResolvedValue(undefined);
    const interaction = { reply, user: { id: "admin-999" }, options: { getSubcommand: vi.fn() } };
    await realGhid(interaction as never);
    const call = reply.mock.calls[0]?.[0] as { embeds: { fields: { value: string }[] }[] };
    const allText = call.embeds[0]!.fields.map((f) => f.value).join("\n");
    expect(allText).toContain("fa dreptate");
    expect(allText).toContain("judeca-i");
  });

  it("handleAdminGhid embed contains pardon trigger phrases ('iarta', 'pardoneaza')", async () => {
    const { handleAdminGhid: realGhid } = await vi.importActual("../oracle-blestem") as typeof import("../oracle-blestem");
    const reply = vi.fn().mockResolvedValue(undefined);
    const interaction = { reply, user: { id: "admin-999" }, options: { getSubcommand: vi.fn() } };
    await realGhid(interaction as never);
    const call = reply.mock.calls[0]?.[0] as { embeds: { fields: { value: string }[] }[] };
    const allText = call.embeds[0]!.fields.map((f) => f.value).join("\n");
    expect(allText).toContain("iarta");
    expect(allText).toContain("pardoneaza");
  });

  it("handleAdminGhid embed lists /blestem and /startevent slash commands", async () => {
    const { handleAdminGhid: realGhid } = await vi.importActual("../oracle-blestem") as typeof import("../oracle-blestem");
    const reply = vi.fn().mockResolvedValue(undefined);
    const interaction = { reply, user: { id: "admin-999" }, options: { getSubcommand: vi.fn() } };
    await realGhid(interaction as never);
    const call = reply.mock.calls[0]?.[0] as { embeds: { fields: { value: string }[] }[] };
    const allText = call.embeds[0]!.fields.map((f) => f.value).join("\n");
    expect(allText).toContain("/blestem");
    expect(allText).toContain("/startevent");
  });
});

describe("/admin offline — isOwner regression guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("blocks a non-owner from /admin offline with the restriction message", async () => {
    const interaction = makeAdminInteraction({
      sub: "offline",
      userId: "admin-999",
      guildOwnerId: "guild-owner-111",
    });
    await handleAdmin(interaction as never);
    // isOwner sends the blocking reply when the user is not SUPER_ADMIN_ID
    expect(interaction._reply).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining("Nu ai permisiunea"),
      }),
    );
  });

  it("does NOT block the super admin from /admin offline", async () => {
    const interaction = makeAdminInteraction({
      sub: "offline",
      userId: "585841275765522442", // SUPER_ADMIN_ID
      guildOwnerId: "guild-owner-111",
    });
    await handleAdmin(interaction as never);
    // The reply for the super admin should be the success message, not the restriction
    expect(interaction._reply).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining("offline"),
      }),
    );
    expect(interaction._reply).not.toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining("Nu ai permisiunea"),
      }),
    );
  });
});
