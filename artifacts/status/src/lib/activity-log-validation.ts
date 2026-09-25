type ActivityLogDraft = {
  enabled: boolean;
  roleIds: string[];
  categories: Record<string, boolean>;
};

export function activityLogDraftError(activityLog: ActivityLogDraft): string | null {
  if (!activityLog.enabled) return null;
  if (!Object.values(activityLog.categories).some(Boolean)) {
    return "Selectează cel puțin o categorie pentru jurnalul Discord.";
  }
  if (activityLog.roleIds.length === 0) {
    return "Selectează cel puțin un rol care poate vedea canalele private de jurnal.";
  }
  return null;
}