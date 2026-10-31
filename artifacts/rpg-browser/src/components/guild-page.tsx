import { type ReactNode } from "react";
import { useParams, useLocation } from "wouter";
import { useGameLogout, useGetGameOverview, useGetGameSession, getGetGameOverviewQueryKey, getGetGameSessionQueryKey } from "@workspace/api-client-react";
import type { GameOverview } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { GuildShell, LoadingState, Notice, PageFrame } from "@/components/game-ui";

export function GuildPage({ children }: { children: (overview: GameOverview, guildId: string, csrfToken: string) => ReactNode }) {
  const params = useParams<{ guildId: string }>();
  const guildId = params.guildId;
  const overviewQuery = useGetGameOverview(guildId ?? "", {
    query: {
      queryKey: getGetGameOverviewQueryKey(guildId ?? ""),
      enabled: Boolean(guildId),
    },
  });
  const sessionQuery = useGetGameSession();
  const csrfToken = sessionQuery.data?.csrfToken ?? "";
  const logout = useGameLogout({
    request: csrfToken
      ? { headers: { "X-CSRF-Token": csrfToken } }
      : undefined,
  });
  const client = useQueryClient();
  const [, navigate] = useLocation();

  if (!guildId) {
    return <PageFrame><Notice title="Breasla nu a fost găsită" detail="Alege o breaslă din pagina de intrare." /></PageFrame>;
  }
  if (overviewQuery.isLoading || sessionQuery.isLoading) {
    return <PageFrame><LoadingState label="Încărcăm personajul și starea breslei..." /></PageFrame>;
  }
  if (sessionQuery.isError || !sessionQuery.data?.authenticated || !csrfToken) {
    return <PageFrame><Notice title="Sesiunea de joc nu este disponibilă" detail="Reîncarcă sesiunea Discord înainte de a modifica starea personajului." retry={() => { void sessionQuery.refetch(); void overviewQuery.refetch(); }} /></PageFrame>;
  }
  if (overviewQuery.isError || !overviewQuery.data) {
    return <PageFrame><Notice title="Cronica nu s-a deschis" detail="Nu am putut încărca datele personajului pentru această breaslă. Verifică sesiunea și încearcă din nou." retry={() => void overviewQuery.refetch()} /></PageFrame>;
  }

  const onLogout = () => {
    logout.mutate(undefined, {
      onSuccess: async () => {
        await client.invalidateQueries({ queryKey: getGetGameSessionQueryKey() });
        navigate("/");
      },
    });
  };

  return <GuildShell overview={overviewQuery.data} guildId={guildId} onLogout={onLogout} logoutPending={logout.isPending} logoutError={logout.isError}>{children(overviewQuery.data, guildId, csrfToken)}</GuildShell>;
}

export function updateGuildOverview(client: ReturnType<typeof useQueryClient>, guildId: string, overview: GameOverview) {
  client.setQueryData(getGetGameOverviewQueryKey(guildId), overview);
}
