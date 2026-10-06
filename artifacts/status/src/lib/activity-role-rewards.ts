export interface ActivityRoleReward {
  level: number;
  roleId: string;
}

export function activityRoleRewardsError(rewards: ActivityRoleReward[] | null): string {
  if (rewards === null) return "";
  const levels = new Set<number>();
  const roles = new Set<string>();
  for (const reward of rewards) {
    if (!Number.isInteger(reward.level) || reward.level < 1 || reward.level > 100) {
      return "Alege pentru fiecare prag un nivel întreg între 1 și 100.";
    }
    if (!/^\d{5,25}$/.test(reward.roleId)) return "Alege un rol Discord pentru fiecare prag.";
    if (levels.has(reward.level)) return "Un nivel poate avea un singur rol.";
    if (roles.has(reward.roleId)) return "Același rol nu poate fi folosit la două niveluri.";
    levels.add(reward.level);
    roles.add(reward.roleId);
  }
  return "";
}
