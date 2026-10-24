/**
 * Pagina de start a site-ului („/”): cele două uși.
 *
 * Arată pagina „Autentificare operator”: ușa către comunitatea oficială
 * („Regatul Cenușii”, pe /regatul-cenusii) și ușa către panoul botului. Cine are deja o
 * sesiune de operator intră în panou fără altă autentificare; ceilalți pornesc
 * autentificarea Discord. Ghidul serverului este pagina /regatul-cenusii.
 */
import { useSearch } from "wouter";
import { useModerationAuthConfig, useSession } from "../../hooks/use-moderation-api";
import { gateConnection } from "../moderation/gate/authBridge";
import { OperatorGate } from "../moderation/gate/OperatorGate";

export function StartPage() {
  const search = useSearch();
  const { session, loading: sessionLoading } = useSession();
  const { authConfig, loading: authConfigLoading, error, retry } = useModerationAuthConfig();

  return (
    <OperatorGate
      {...gateConnection({
        signedIn: Boolean(session?.authenticated),
        authConfig,
        // Ușa comunității merge din prima clipă; numai ușa panoului așteaptă răspunsurile.
        loading: authConfigLoading || (sessionLoading && !session),
        error,
        retry,
        search,
      })}
    />
  );
}
