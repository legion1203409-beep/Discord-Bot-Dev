import { useLocation, useSearch } from "wouter";
import { Monitor, ShieldAlert } from "lucide-react";
import { useEffect, type ReactNode } from "react";
import { useSession, useActiveGuild, useModerationAuthConfig } from "../../hooks/use-moderation-api";
import { Button } from "../../components/ui/button";
import { DiscordLoadingScreen } from "../../components/moderation/DiscordLoadingScreen";
import "./moderation.css";
import { ModerationChrome } from "./ModerationChrome";
import { gateAuthState } from "./gate/authState";
import { OperatorGate } from "./gate/OperatorGate";
import { OperatorPicker } from "./picker/OperatorPicker";

const DISCORD_OAUTH_START = "/api/moderation/oauth/discord";
const AUTH_ERROR_FALLBACK = "Autentificarea Discord nu a putut fi finalizată. Încearcă din nou.";
const AUTH_ERROR_MESSAGES: Record<string, string> = {
  oauth_not_configured: "Autentificarea Discord nu este configurată pe server.",
  state_mismatch: "Sesiunea de autentificare a expirat sau nu mai este validă. Încearcă din nou.",
  cancelled: "Autentificarea a fost anulată. Poți încerca din nou când ești pregătit.",
  oauth_failed: "Discord nu a putut finaliza autentificarea. Încearcă din nou.",
  no_eligible_guild: "Nu ai un server eligibil pentru moderare. Verifică dacă botul este membru pe server și dacă ai rol de staff sau administrator, apoi încearcă din nou cu un alt cont Discord.",
};

function authErrorMessage(): string | null {
  if (typeof window === "undefined") return null;
  const code = new URLSearchParams(window.location.search).get("auth_error");
  return code ? AUTH_ERROR_MESSAGES[code] || AUTH_ERROR_FALLBACK : null;
}

function sameOriginDiscordUrl(value: string | undefined): string | null {
  if (!value || typeof window === "undefined") return null;
  try {
    const parsed = new URL(value, window.location.origin);
    if (parsed.origin !== window.location.origin || parsed.pathname !== DISCORD_OAUTH_START) return null;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return null;
  }
}

export function ModerationLayout({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const search = useSearch();
  const { session, loading, error, logout, retry } = useSession();
  const {
    authConfig,
    loading: authConfigLoading,
    error: authConfigError,
    retry: retryAuthConfig,
  } = useModerationAuthConfig();
  const { guildId, setGuildId, guilds } = useActiveGuild();
  const botProfile = authConfig?.bot;

  useEffect(() => {
    const targetId = window.location.hash.slice(1);
    if (!targetId) return;

    let timer: number | undefined;
    let attempts = 0;
    const scrollToTarget = () => {
      const target = document.getElementById(targetId);
      if (target) {
        target.scrollIntoView({ behavior: "smooth", block: "center" });
        return;
      }
      if (attempts++ < 80) timer = window.setTimeout(scrollToTarget, 100);
    };
    const frame = window.requestAnimationFrame(scrollToTarget);

    return () => {
      window.cancelAnimationFrame(frame);
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [location, search]);

  if (!error && (loading || (authConfigLoading && !session?.authenticated))) {
    return <DiscordLoadingScreen />;
  }

  if (error) {
    return (
      <div className="mod-shell dark flex flex-col items-center justify-center p-4">
        <div className="mod-card w-full max-w-md rounded-2xl p-8 text-center">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl border border-destructive/30 bg-destructive/10 text-destructive">
            <ShieldAlert className="w-8 h-8" />
          </div>
          <p className="mod-eyebrow text-destructive">Legătura s-a rupt</p>
          <h2 className="mt-2 text-3xl font-display font-semibold text-foreground">Conexiune Întreruptă</h2>
          <p className="text-muted-foreground mb-8 mt-3 leading-relaxed">
            Oracolul nu poate fi contactat momentan ({error.message}). <br />
            Piatra de suflete necesită o reconectare.
          </p>
          <Button onClick={() => void retry().catch(() => undefined)} className="gap-2 font-medium tracking-wide" data-testid="button-retry-session">
            <Monitor className="w-4 h-4" /> REÎNCEARCĂ CONEXIUNEA
          </Button>
        </div>
      </div>
    );
  }

  if (!session?.authenticated) {
    return (
      <OperatorGate
        botName={botProfile?.name}
        botInviteUrl={authConfig?.botInviteUrl}
        authError={authErrorMessage()}
        auth={gateAuthState({
          loading: authConfigLoading,
          error: authConfigError,
          retry: () => void retryAuthConfig().catch(() => undefined),
          configured: Boolean(authConfig?.discordOAuthConfigured),
          loginUrl: sameOriginDiscordUrl(authConfig?.authorizationUrl),
        })}
      />
    );
  }

  const switchAccount = async () => {
    await logout();
    const authorizationUrl = sameOriginDiscordUrl(authConfig?.authorizationUrl);
    if (authConfig?.discordOAuthConfigured && authorizationUrl) {
      window.location.assign(authorizationUrl);
    }
  };

  if (!guildId) {
    return (
      <OperatorPicker
        guilds={guilds}
        onSelect={setGuildId}
        onLogout={logout}
        onSwitchAccount={switchAccount}
        botInviteUrl={authConfig?.botInviteUrl}
      />
    );
  }

  return <ModerationChrome>{children}</ModerationChrome>;
}
