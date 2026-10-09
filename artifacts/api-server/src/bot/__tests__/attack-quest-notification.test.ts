import { readFileSync } from "node:fs";
import { transformSync } from "esbuild";
import { EmbedBuilder, type InteractionEditReplyOptions } from "discord.js";
import { describe, expect, it, vi } from "vitest";
import { QuestNotifications } from "../quest-notifications";

// Execute the production handler in isolation, without starting the gateway or
// importing the unrelated Oracle/moderation services from the bot entrypoint.
const source = readFileSync(new URL("../index.ts", import.meta.url), "utf8");
const handlerSource = source.slice(
  source.indexOf("async function handleAttack("),
  source.indexOf("\nasync function handleRetreat("),
);
const handlerCode = transformSync(handlerSource, { loader: "ts", target: "es2022" }).code;

function setup(levelUp = false) {
  let participant = {
    id: 1, discordId: "alice", isAlive: true, pendingLevelup: false,
    monsterLevel: 9, monsterRarity: "comun", currentHp: 100, maxHp: 100,
    totalDamage: 0, oboli: 0, xp: 0, baseOboli: 0, baseXp: 0, itemsFarmed: {},
  };
  const player = { mana: 10, class: null };
  const result = {
    oboliGained: 5, xpGained: 5, monsterDefeated: true, playerDied: false,
    newPlayerHp: 90, playerDmg: 10, newMonsterLevel: levelUp ? 10 : 9,
    newMonsterHp: 100, newMonsterRarity: "comun", levelUp,
    shieldManaDrained: 0, hpRegen: 0,
  };
  const quest = { target: 10, reward: { itemKey: "potiune", qty: 2 } };
  const config = { economy: { monsterGoldMultiplier: 1, monsterXpMultiplier: 1 } };
  const completionText = "Misiune completată! Recompensă: 2 poțiuni";
  const deps = {
    questNotifications: new QuestNotifications(),
    getParticipant: vi.fn(async () => participant),
    getPlayerById: vi.fn(async () => player),
    getActiveEvent: vi.fn(async () => ({ isActive: true, expiresAt: new Date(Date.now() + 60_000) })),
    getGameplayConfig: () => config,
    doCombat: vi.fn(() => ({ ...result })),
    isBossFight: () => false,
    recordPersonalActivity: vi.fn(async () => {}),
    maxMana: () => 10,
    manaRegenPerAttack: () => 1,
    regenPlayerMana: vi.fn(async () => player),
    getRewardMultipliers: () => ({ xpMult: 1, goldMult: 1 }),
    prestigeGoldMult: () => 1,
    rollItemDrop: () => null,
    rollMaterialDrop: () => null,
    rollEquipmentMaterialDrop: () => null,
    rollEquipmentDrop: () => null,
    randomCorruptedKeyDrop: () => false,
    incrementDailyQuest: vi.fn()
      .mockResolvedValueOnce({ newProgress: 10, justCompleted: true })
      .mockResolvedValue({ newProgress: 10, justCompleted: false }),
    dailyQuestDefinitions: () => ({ kill_10: quest }),
    DAILY_QUESTS: { kill_10: quest },
    addPlayerGold: vi.fn(async () => {}),
    addPlayerXp: vi.fn(async () => {}),
    updateMaxLevel: vi.fn(async () => {}),
    addPlayerItem: vi.fn(async () => {}),
    updateParticipant: vi.fn(async (_id: number, changes: Partial<typeof participant>) => {
      participant = { ...participant, ...changes };
      return participant;
    }),
    monsterSpawnHp: () => 100,
    LEVELUP_INTERVAL: 10,
    buildDailyQuestCompletionText: vi.fn(() => completionText),
    buildLevelupEmbed: vi.fn((_level: number, text?: string) =>
      new EmbedBuilder().setTitle("Nivel nou").setDescription(text ?? "Alege bonusul")),
    levelupRows: () => [],
    buildResultText: vi.fn((_result, _drop, _base, _completed, quests: string[]) =>
      quests.length ? completionText : "Atac normal"),
    buildCombatEmbed: vi.fn((_p, text: string) =>
      new EmbedBuilder().setTitle("Luptă").setDescription(text)),
    combatRow: () => ({ type: 1, components: [] }),
    logger: { error: vi.fn(), warn: vi.fn() },
  };
  const handleAttack = new Function(...Object.keys(deps), `${handlerCode}; return handleAttack;`)(
    ...Object.values(deps),
  ) as (button: typeof interaction, eventId: number) => Promise<void>;
  const interaction = {
    guildId: "guild-a",
    user: { id: "alice", displayAvatarURL: () => "https://example.com/avatar.png" },
    message: { id: "combat-message" },
    deferUpdate: vi.fn(async () => {}),
    editReply: vi.fn(async (_payload: InteractionEditReplyOptions) => {}),
  };
  return { deps, handleAttack, interaction, completionText };
}

describe.each([false, true])("attack reward notification (level up: %s)", (levelUp) => {
  it("recovers the exact failed edit without fighting or granting the reward again", async () => {
    const { deps, handleAttack, interaction, completionText } = setup(levelUp);
    interaction.editReply.mockRejectedValueOnce(new Error("Discord temporarily unavailable"));
    await expect(handleAttack(interaction, 123)).rejects.toThrow("temporarily unavailable");
    const failedPayload = interaction.editReply.mock.calls[0]![0];
    const embed = failedPayload.embeds![0] as EmbedBuilder;
    expect(embed.data.title).toBe(levelUp ? "Nivel nou" : "Luptă");
    expect(embed.data.description).toContain(completionText);
    expect(deps.addPlayerItem).toHaveBeenCalledExactlyOnceWith("alice", "guild-a", "potiune", 2);

    await handleAttack(interaction, 123);
    expect(interaction.editReply).toHaveBeenLastCalledWith(failedPayload);
    expect(deps.doCombat).toHaveBeenCalledOnce();
    expect(deps.incrementDailyQuest).toHaveBeenCalledOnce();
    expect(deps.updateParticipant).toHaveBeenCalledOnce();
    expect(deps.addPlayerItem).toHaveBeenCalledOnce();

    await handleAttack(interaction, 123);
    const nextPayload = interaction.editReply.mock.calls[2]![0];
    expect((nextPayload.embeds![0] as EmbedBuilder).data.description).not.toContain(completionText);
    expect(deps.addPlayerItem).toHaveBeenCalledOnce();
  });

  it("does not repeat a successfully delivered notification", async () => {
    const { deps, handleAttack, interaction, completionText } = setup(levelUp);
    await handleAttack(interaction, 123);
    await handleAttack(interaction, 123);
    const descriptions = interaction.editReply.mock.calls.map(([payload]) =>
      (payload.embeds![0] as EmbedBuilder).data.description);
    expect(descriptions.filter((text) => text?.includes(completionText))).toHaveLength(1);
    expect(deps.addPlayerItem).toHaveBeenCalledOnce();
  });
});

describe("notification delivery serialization", () => {
  const payload = { content: "Reward already granted" };

  it("keeps the notification pending across repeated Discord errors", async () => {
    const notifications = new QuestNotifications();
    const edit = vi.fn().mockRejectedValueOnce(new Error("first"))
      .mockRejectedValueOnce(new Error("second")).mockResolvedValue(undefined);
    await expect(notifications.deliver("key", payload, true, edit)).rejects.toThrow("first");
    await expect(notifications.recover("key", edit)).rejects.toThrow("second");
    expect(await notifications.recover("key", edit)).toBe(true);
    expect(await notifications.recover("key", edit)).toBe(false);
    expect(edit).toHaveBeenCalledTimes(3);
  });

  it("makes concurrent recovery clicks send only one edit", async () => {
    const notifications = new QuestNotifications();
    await expect(notifications.deliver("key", payload, true, async () => {
      throw new Error("offline");
    })).rejects.toThrow("offline");
    const edit = vi.fn(async () => {});
    expect(await Promise.all([
      notifications.recover("key", edit),
      notifications.recover("key", edit),
    ])).toEqual([true, true]);
    expect(edit).toHaveBeenCalledOnce();
  });

  it("isolates message/player/guild/event keys and ignores edits without a reward", async () => {
    const notifications = new QuestNotifications();
    const fail = async () => { throw new Error("offline"); };
    await expect(notifications.deliver("guild-a/alice/123/message", payload, true, fail)).rejects.toThrow();
    await expect(notifications.deliver("ordinary", payload, false, fail)).rejects.toThrow();
    const edit = vi.fn(async () => {});
    for (const key of ["guild-b/alice/123/message", "guild-a/bob/123/message",
      "guild-a/alice/456/message", "guild-a/alice/123/other-message", "ordinary"]) {
      expect(await notifications.recover(key, edit)).toBe(false);
    }
    expect(edit).not.toHaveBeenCalled();
    expect(await notifications.recover("guild-a/alice/123/message", edit)).toBe(true);
  });
});
