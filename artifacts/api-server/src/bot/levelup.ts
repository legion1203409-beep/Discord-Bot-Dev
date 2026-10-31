import type { EventParticipant } from "@workspace/db";

export type LevelUpBonus = "xp" | "dodge" | "attack" | "hp" | "crit";

export function levelUpBonusValues(
  participant: EventParticipant,
  bonus: LevelUpBonus,
): Partial<EventParticipant> {
  switch (bonus) {
    case "xp":
      return { xpPerKill: participant.xpPerKill + 5 };
    case "dodge":
      return { dodgeBonus: participant.dodgeBonus + 3 };
    case "attack":
      return { attackBonus: participant.attackBonus + 2 };
    case "hp":
      return {
        maxHp: participant.maxHp + 5,
        currentHp: Math.min(
          participant.maxHp + 5,
          participant.currentHp + 5,
        ),
      };
    case "crit":
      return { critBonus: participant.critBonus + 1 };
  }
}
