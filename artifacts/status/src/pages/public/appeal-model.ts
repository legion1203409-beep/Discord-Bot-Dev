/** Ce întoarce /api/moderation/appeals/* (oglindă a AppealView din api-server/src/moderation/appeals.ts). */
export type AppealStatusValue = "pending" | "accepted" | "rejected";

export type AppealView = {
  enabled: boolean;
  guild: { id: string; name: string; iconUrl: string | null };
  banned: boolean;
  ban: { reason: string | null; caseId: string | null; at: string | null } | null;
  appeal: {
    id: string; status: AppealStatusValue; body: string | null; createdAt: string;
    decidedAt: string | null; decisionNote: string | null; question: { id: string; text: string } | null;
  } | null;
  canAppeal: boolean;
  nextAllowedAt: string | null;
  inviteUrl: string | null;
};

export type AppealSession =
  | { authenticated: false; enabled: boolean }
  | { authenticated: true; user: { id: string; name: string; username: string; avatar: string | null }; status: AppealView };

export const APPEAL_MIN = 30;
export const APPEAL_MAX = 2000;

export const APPEAL_ERRORS: Record<string, string> = {
  cancelled: "Ai anulat conectarea cu Discord. Poți încerca din nou oricând.",
  oauth_failed: "Conectarea cu Discord n-a reușit. Încearcă din nou.",
  invalid_server: "Linkul nu duce la un server cunoscut.",
};

/** Which screen the page shows for a signed-in person. */
export type AppealScreen = "disabled" | "not-banned" | "form" | "pending" | "question" | "accepted" | "rejected-wait" | "rejected-open";

export function appealScreen(status: AppealView): AppealScreen {
  if (status.appeal?.status === "accepted" && !status.banned) return "accepted";
  if (!status.enabled) return "disabled";
  if (!status.banned) return "not-banned";
  const appeal = status.appeal;
  if (appeal?.status === "pending") return appeal.question ? "question" : "pending";
  if (appeal?.status === "rejected") return status.canAppeal ? "rejected-open" : "rejected-wait";
  return "form";
}

export function appealAvatarUrl(user: { id: string; avatar: string | null }): string {
  return user.avatar
    ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=96`
    : `https://cdn.discordapp.com/embed/avatars/${Number((BigInt(user.id) >> 22n) % 6n)}.png`;
}

export function formatAppealDate(value: string | null): string {
  return value ? new Intl.DateTimeFormat("ro-RO", { day: "numeric", month: "long", year: "numeric" }).format(new Date(value)) : "";
}
