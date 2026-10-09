import { incrementDailyQuest } from "./db";
import { DAILY_QUESTS, type BossRarity } from "./survival";

/** Call only after defeat; fleeing bosses and ordinary combat never count. */
export async function awardRareBossDailyQuest(
  guildId: string,
  rarity: BossRarity,
  damageBy: ReadonlyMap<string, number>,
): Promise<string[]> {
  if (rarity !== "epic" && rarity !== "legendar") return [];

  const quest = DAILY_QUESTS.kill_boss_rare;
  const results = await Promise.all(
    [...damageBy.entries()]
      .filter(([, damage]) => damage > 0)
      .map(async ([discordId]) => {
        const progress = await incrementDailyQuest(
          discordId, guildId, "kill_boss_rare", quest.target, quest.reward,
        );
        if (!progress.justCompleted) return null;
        return discordId;
      }),
  );
  return results.filter((id): id is string => id !== null);
}
