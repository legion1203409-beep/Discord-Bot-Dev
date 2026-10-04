type ActivityLogDraft = {
  enabled: boolean;
  categories: Record<string, boolean>;
};

export function activityLogDraftError(activityLog: ActivityLogDraft): string | null {
  if (!activityLog.enabled) return null;
  if (!Object.values(activityLog.categories).some(Boolean)) {
    return "Selectează cel puțin o categorie pentru jurnalul Discord.";
  }
  return null;
}