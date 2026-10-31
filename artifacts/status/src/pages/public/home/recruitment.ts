import type { PublicServerProfile, RecruitmentDashboard } from "@workspace/api-client-react";
import type { OracleFacts } from "./oracle/archive";

/** Ce arată secțiunea „Recrutare”, în funcție de ce s-a încărcat. */
export type RecruitmentView =
  | { kind: "loading" }
  | { kind: "profile-error"; retry: () => void }
  | { kind: "no-guild" }
  | { kind: "error"; retry: () => void }
  | { kind: "inactive" }
  | { kind: "active"; dashboard: RecruitmentDashboard }
  | { kind: "empty" };

interface QueryLike<T> {
  isLoading: boolean;
  isError: boolean;
  data: T | undefined;
  refetch: () => unknown;
}

export function recruitmentView(
  profile: QueryLike<PublicServerProfile>,
  guildId: string | null,
  dashboard: QueryLike<RecruitmentDashboard>,
): RecruitmentView {
  if (profile.isLoading || (Boolean(guildId) && dashboard.isLoading)) return { kind: "loading" };
  if (profile.isError) return { kind: "profile-error", retry: () => void profile.refetch() };
  if (!guildId) return { kind: "no-guild" };
  if (dashboard.isError) return { kind: "error", retry: () => void dashboard.refetch() };
  if (dashboard.data && !dashboard.data.enabled) return { kind: "inactive" };
  if (dashboard.data) return { kind: "active", dashboard: dashboard.data };
  return { kind: "empty" };
}

/** Starea programului, în forma pe care o înțelege Oracolul. */
export function recruitmentFact(view: RecruitmentView): OracleFacts["recruitment"] {
  if (view.kind === "active") return "active";
  if (view.kind === "inactive") return "inactive";
  return "unknown";
}
