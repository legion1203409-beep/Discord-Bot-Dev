import {
  addPlayerGold,
  addPlayerItem,
  addPlayerKey,
  addPlayerXp,
  deductPlayerGold,
  drainPlayerMana,
  getActiveEvent,
  getPlayerById,
  incrementBossKill,
  incrementDailyQuest,
  regenPlayerMana,
  recordPlayerDeath,
  updateMaxLevel,
  updateParticipant,
  grantEquipment,
  getParticipant,
} from "./db";
import { getGameplayConfig, isGameplayPaused } from "./gameplay-store";
import { getRewardMultipliers } from "./status-effects";
import { randomCorruptedKeyDrop, recordPersonalActivity } from "./chest-expansions";
import {
  CLASSES,
  dailyQuestDefinitions,
  doCombat,
  isClassKey,
  isBossFight,
  bossIndex,
  monsterSpawnHp,
  rollEquipmentDrop,
  rollEquipmentMaterialDrop,
  rollItemDrop,
  rollMaterialDrop,
  maxMana,
  manaRegenPerAttack,
  prestigeGoldMult,
  talismanValue,
  type DailyQuestKey,
} from "./survival";
import { withCombatTurnLock, combatTurnLockKey } from "./combat-lock";
import { logger } from "../lib/logger";

export class BrowserCombatError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
    this.name = "BrowserCombatError";
  }
}

function resultMessage(input: {
  playerDamage: number;
  monsterDamage: number;
  monsterDefeated: boolean;
  playerDied: boolean;
}): string {
  if (input.playerDied) {
    return `Ai primit ${input.playerDamage} daune și ai provocat ${input.monsterDamage}, dar ai fost învins înainte să încasezi recompensa.`;
  }
  if (input.monsterDefeated) {
    return `Ai învins monstrul și ai provocat ${input.monsterDamage} daune.`;
  }
  return input.playerDamage > 0
    ? `Ai provocat ${input.monsterDamage} daune și ai primit ${input.playerDamage} daune.`
    : `Ai provocat ${input.monsterDamage} daune.`;
}

export async function browserCombatAttack(
  guildId: string,
  eventId: number,
  discordId: string,
): Promise<{
  playerDamage: number;
  monsterDamage: number;
  monsterDefeated: boolean;
  playerDied: boolean;
  xpGained: number;
  oboliGained: number;
  message: string;
}> {
  return withCombatTurnLock(
    combatTurnLockKey(guildId, eventId, discordId),
    () => resolveBrowserCombatAttack(guildId, eventId, discordId),
  );
}

async function resolveBrowserCombatAttack(
  guildId: string,
  eventId: number,
  discordId: string,
) {
  if (isGameplayPaused(guildId)) {
    throw new BrowserCombatError(409, "Gameplay is paused for this guild");
  }

  const [event, participant, player] = await Promise.all([
    getActiveEvent(eventId, guildId),
    getParticipant(eventId, guildId, discordId),
    getPlayerById(discordId, guildId),
  ]);
  if (!event || !event.isActive || event.expiresAt.getTime() <= Date.now()) {
    throw new BrowserCombatError(404, "The encounter is no longer active");
  }
  if (!participant || !player) {
    throw new BrowserCombatError(404, "Join the encounter before attacking");
  }
  if (!participant.isAlive) {
    throw new BrowserCombatError(409, "This character can no longer attack");
  }
  if (participant.pendingLevelup) {
    throw new BrowserCombatError(409, "Choose the pending level-up bonus first");
  }

  const gameplayConfig = getGameplayConfig(guildId);
  const talismanKey = player.talisman ?? null;
  const talismanLevel = player.talismanLevel ?? 1;
  const result = doCombat(
    participant,
    talismanKey,
    talismanLevel,
    player.bossKills,
    participant.shieldHp,
  );

  const bossFight = isBossFight(participant.monsterLevel, participant.monsterRarity);
  result.oboliGained = Math.round(
    result.oboliGained * (bossFight
      ? gameplayConfig.economy.bossGoldMultiplier
      : gameplayConfig.economy.monsterGoldMultiplier),
  );
  result.xpGained = Math.round(
    result.xpGained * (bossFight
      ? gameplayConfig.economy.bossXpMultiplier
      : gameplayConfig.economy.monsterXpMultiplier),
  );

  const manaMax = maxMana(player.manaLevel ?? 0);
  const manaBefore = player.mana ?? 0;
  await regenPlayerMana(
    discordId,
    guildId,
    manaRegenPerAttack(player.manaLevel ?? 0, player.manaRegenLevel ?? 0),
    manaMax,
  ).catch((error) => {
    logger.error({ err: error, discordId, guildId }, "Browser combat mana regeneration failed");
  });
  const shieldManaDrain = result.shieldManaDrained;
  if (shieldManaDrain > 0) {
    await drainPlayerMana(discordId, guildId, shieldManaDrain).catch((error) => {
      logger.error({ err: error, discordId, guildId }, "Browser combat shield mana drain failed");
    });
  }

  if (result.monsterDefeated && bossFight) {
    await incrementBossKill(discordId, guildId, bossIndex(participant.monsterLevel)).catch((error) => {
      logger.error({ err: error, discordId, guildId }, "Browser combat boss progression update failed");
    });
  }

  const baseXp = result.xpGained;
  const baseOboli = result.oboliGained;
  if (result.oboliGained > 0) {
    const playerClass = player.class && isClassKey(player.class)
      ? CLASSES[player.class]
      : null;
    if (playerClass) {
      result.xpGained = Math.round(result.xpGained * playerClass.xpMult);
      result.oboliGained = Math.round(result.oboliGained * playerClass.oboliMult);
    }
    const rewardMultipliers = getRewardMultipliers(discordId, guildId);
    result.xpGained = Math.round(result.xpGained * rewardMultipliers.xpMult);
    result.oboliGained = Math.round(result.oboliGained * rewardMultipliers.goldMult);
    if (talismanKey === "piatra_eco") {
      result.xpGained = Math.round(
        result.xpGained * (1 + talismanValue("piatra_eco", talismanLevel) / 100),
      );
    }
    result.oboliGained = Math.round(
      result.oboliGained * prestigeGoldMult(player.prestigeLevel ?? 0),
    );
  }

  const itemDrop = result.oboliGained > 0 ? rollItemDrop(participant.monsterLevel) : null;
  const materialDrop = result.monsterDefeated
    ? rollMaterialDrop(participant.monsterRarity)
    : null;
  const equipmentMaterialDrop = result.monsterDefeated
    ? rollEquipmentMaterialDrop(participant.monsterRarity)
    : null;
  const equipmentDrop = result.monsterDefeated
    ? rollEquipmentDrop(participant.monsterLevel, participant.monsterRarity)
    : null;
  const corruptedKeyDrop = result.monsterDefeated && randomCorruptedKeyDrop();
  const itemsFarmed: Record<string, number> = { ...(participant.itemsFarmed ?? {}) };
  for (const itemKey of [itemDrop, materialDrop, equipmentMaterialDrop, equipmentDrop]) {
    if (itemKey) itemsFarmed[itemKey] = (itemsFarmed[itemKey] ?? 0) + 1;
  }

  if (result.playerDied) {
    const lostOboli = Math.floor(participant.oboli * 0.2);
    await updateParticipant(participant.id, {
      isAlive: false,
      currentHp: 0,
      empowerNext: false,
      shieldNext: false,
      shieldHp: 0,
    });
    await Promise.all([
      deductPlayerGold(discordId, guildId, lostOboli),
      recordPlayerDeath(discordId, guildId, participant.monsterLevel),
    ]);
    return {
      playerDamage: result.monsterDmg,
      monsterDamage: result.playerDmg,
      monsterDefeated: false,
      playerDied: true,
      xpGained: 0,
      oboliGained: 0,
      message: resultMessage({
        playerDamage: result.monsterDmg,
        monsterDamage: result.playerDmg,
        monsterDefeated: false,
        playerDied: true,
      }),
    };
  }

  const lifeTalismanHeal = result.oboliGained > 0 && talismanKey === "crista_vietii"
    ? talismanValue("crista_vietii", talismanLevel)
    : 0;
  const finalPlayerHp = lifeTalismanHeal > 0
    ? Math.min(participant.maxHp, result.newPlayerHp + lifeTalismanHeal)
    : Math.min(participant.maxHp, result.newPlayerHp + result.hpRegen);

  const questProgress: DailyQuestKey[] = [];
  let completedQuests: DailyQuestKey[] = [];
  const questDefinitions = dailyQuestDefinitions(gameplayConfig);
  if (result.oboliGained > 0) {
    questProgress.push("kill_10");
    if (participant.monsterRarity && participant.monsterRarity !== "comun") {
      questProgress.push("rare_3");
    }
    if (participant.monsterRarity === "boss") questProgress.push("boss_1");

    const updates = await Promise.all(questProgress.map((key) =>
      incrementDailyQuest(discordId, guildId, key, questDefinitions[key].target),
    ));
    completedQuests = questProgress.filter((_, index) => updates[index]!.justCompleted);
  }

  if (result.monsterDefeated) {
    await Promise.all([
      recordPersonalActivity(discordId, guildId, "kills").catch((error) => {
        logger.warn({ err: error, discordId, guildId }, "Browser combat kill activity update failed");
      }),
      ...(bossFight
        ? [recordPersonalActivity(discordId, guildId, "bosses").catch((error) => {
            logger.warn({ err: error, discordId, guildId }, "Browser combat boss activity update failed");
          })]
        : []),
    ]);
  }

  if (result.oboliGained > 0) {
    await Promise.all([
      addPlayerGold(discordId, guildId, result.oboliGained),
      addPlayerXp(discordId, guildId, result.xpGained),
      updateMaxLevel(discordId, guildId, result.newMonsterLevel),
      ...(itemDrop ? [addPlayerItem(discordId, guildId, itemDrop)] : []),
      ...(materialDrop ? [addPlayerItem(discordId, guildId, materialDrop)] : []),
      ...(equipmentMaterialDrop
        ? [addPlayerItem(discordId, guildId, equipmentMaterialDrop)]
        : []),
      ...(equipmentDrop ? [grantEquipment(discordId, guildId, equipmentDrop)] : []),
      ...(corruptedKeyDrop ? [addPlayerKey(discordId, guildId, "pangarita")] : []),
      ...completedQuests.map((questKey) => addPlayerItem(
        discordId,
        guildId,
        questDefinitions[questKey].reward.itemKey,
        questDefinitions[questKey].reward.qty,
      )),
      ...(completedQuests.length > 0
        ? [recordPersonalActivity(discordId, guildId, "quests", completedQuests.length).catch((error) => {
            logger.warn({ err: error, discordId, guildId }, "Browser combat quest activity update failed");
          })]
        : []),
    ]);
    for (const questKey of completedQuests) {
      const reward = questDefinitions[questKey].reward;
      itemsFarmed[reward.itemKey] = (itemsFarmed[reward.itemKey] ?? 0) + reward.qty;
    }
  }

  if (result.levelUp) {
    await updateParticipant(participant.id, {
      currentHp: finalPlayerHp,
      monsterLevel: result.newMonsterLevel,
      monsterCurrentHp: monsterSpawnHp(
        result.newMonsterLevel,
        result.newMonsterRarity,
        player.bossKills,
      ),
      monsterRarity: result.newMonsterRarity,
      totalDamage: participant.totalDamage + result.playerDmg,
      oboli: participant.oboli + result.oboliGained,
      xp: participant.xp + result.xpGained,
      baseOboli: participant.baseOboli + baseOboli,
      baseXp: participant.baseXp + baseXp,
      itemsFarmed,
      pendingLevelup: true,
      empowerNext: false,
      shieldNext: participant.shieldNext && !result.shieldBroke,
      shieldHp: participant.shieldNext && !result.shieldBroke ? result.shieldHpLeft : 0,
      bossCharge: result.newBossCharge,
    });
  } else {
    await updateParticipant(participant.id, {
      currentHp: finalPlayerHp,
      monsterLevel: result.newMonsterLevel,
      monsterCurrentHp: result.newMonsterHp,
      monsterRarity: result.newMonsterRarity,
      totalDamage: participant.totalDamage + result.playerDmg,
      oboli: participant.oboli + result.oboliGained,
      xp: participant.xp + result.xpGained,
      baseOboli: participant.baseOboli + baseOboli,
      baseXp: participant.baseXp + baseXp,
      itemsFarmed,
      empowerNext: false,
      shieldNext: participant.shieldNext && !result.shieldBroke,
      shieldHp: participant.shieldNext && !result.shieldBroke ? result.shieldHpLeft : 0,
      bossCharge: result.newBossCharge,
    });
  }

  const playerDamage = result.playerDmg;
  const monsterDamage = result.monsterDmg;
  const monsterDefeated = result.monsterDefeated;
  return {
    playerDamage,
    monsterDamage,
    monsterDefeated,
    playerDied: false,
    xpGained: result.xpGained,
    oboliGained: result.oboliGained,
    message: resultMessage({
      playerDamage: monsterDamage,
      monsterDamage: playerDamage,
      monsterDefeated,
      playerDied: false,
    }),
  };
}
