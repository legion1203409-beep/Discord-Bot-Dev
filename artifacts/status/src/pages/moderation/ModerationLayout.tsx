import { useLocation, useSearch } from "wouter";
import { BookOpen, Monitor, RefreshCw, ShieldAlert } from "lucide-react";
import { useEffect, type ReactNode } from "react";
import { FaDiscord } from "react-icons/fa";
import robotMascot from "@assets/generated_images/oracolul-robot-mascot.png";
import { useSession, useActiveGuild, useModerationAuthConfig } from "../../hooks/use-moderation-api";
import { Button } from "../../components/ui/button";
import { GuildSelection } from "./GuildSelection";
import { BotInviteLink } from "../../components/moderation/BotInviteLink";
import { DiscordLoadingScreen } from "../../components/moderation/DiscordLoadingScreen";
import "./moderation.css";
import { ModerationChrome } from "./ModerationChrome";

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

function BotBrandImage() {
  return <img src={robotMascot} alt="" className="h-full w-full object-contain" />;
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
    const authError = authErrorMessage();
    const authorizationUrl = sameOriginDiscordUrl(authConfig?.authorizationUrl);

    return (
      <div className="mod-shell dark mod-login-bg mod-login-stage flex items-center justify-center p-4">
        <div className="mod-login-ambient mod-login-ambient--one" aria-hidden="true" />
        <div className="mod-login-ambient mod-login-ambient--two" aria-hidden="true" />
        <div className="w-full max-w-md bg-card border border-border p-7 sm:p-9 rounded-2xl relative z-10 overflow-hidden mod-card mod-login-card shadow-2xl">
          <div className="mod-card-glow" />
          <div className="mod-login-card-line" aria-hidden="true" />
          <div className="relative">
            <div className="mb-7 flex items-center gap-3">
              <div className="mod-brand-mark overflow-hidden"><BotBrandImage /></div>
              <div>
                <p className="mod-eyebrow">{botProfile?.name || "Oracolul Cenușii"}</p>
                <p className="text-xs text-muted-foreground">Operațiuni de moderare</p>
              </div>
            </div>
            <p className="mod-eyebrow mb-2">Acces controlat</p>
            <h1 className="text-4xl font-display font-semibold mb-3 text-foreground">Autentificare Operator</h1>
            <p className="text-muted-foreground text-sm mb-8 leading-relaxed">
              Conectează-te cu Discord pentru a deschide consola de moderare. După autentificare vei putea alege serverul pe care îl gestionezi.
            </p>

            {authError && (
              <div role="alert" className="mb-6 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm leading-relaxed text-destructive">
                {authError}
              </div>
            )}

            {authConfigLoading ? (
              <div className="flex items-center justify-center gap-2 rounded-md border border-border/60 bg-background/50 px-4 py-4 text-sm text-muted-foreground">
                <RefreshCw className="w-4 h-4 animate-spin" aria-hidden="true" />
                Se verifică disponibilitatea autentificării Discord...
              </div>
            ) : authConfigError ? (
              <div className="space-y-4">
                <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm leading-relaxed text-destructive">
                  {authConfigError.message}
                </div>
                <Button type="button" onClick={() => void retryAuthConfig().catch(() => undefined)} variant="outline" className="w-full gap-2">
                  <RefreshCw className="w-4 h-4" aria-hidden="true" />
                  Reîncearcă
                </Button>
              </div>
            ) : !authConfig?.discordOAuthConfigured || !authorizationUrl ? (
              <div role="status" className="rounded-lg border border-border/70 bg-background/50 px-4 py-4 text-center text-sm leading-relaxed text-muted-foreground">
                Autentificarea Discord nu este disponibilă momentan. Administratorul trebuie să configureze integrarea OAuth înainte de conectare.
              </div>
            ) : (
              <Button
                type="button"
                className="w-full py-6 font-semibold tracking-wide"
                data-testid="discord-login-button"
                onClick={() => window.location.assign(authorizationUrl)}
              >
                <FaDiscord className="w-5 h-5" aria-hidden="true" />
                Conectează-te cu Discord
              </Button>
            )}
            {authConfig?.botInviteUrl && <BotInviteLink href={authConfig.botInviteUrl} className="mt-3 w-full gap-2 py-5" />}

            <div className="mt-8 pt-6 border-t border-border/50">
              <a href="/server" data-testid="link-server-guide-login" className="text-xs font-mono tracking-widest text-muted-foreground hover:text-primary transition-colors inline-flex items-center gap-2">
                <BookOpen className="w-4 h-4" /> GHIDUL SERVERULUI
              </a>
            </div>
          </div>
        </div>
      </div>
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
      <GuildSelection
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
