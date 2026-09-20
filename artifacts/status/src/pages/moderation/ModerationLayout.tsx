import { Link, useLocation } from "wouter";
import { 
  ShieldAlert, Settings, Shield, Bot, History, BookOpen, SlidersHorizontal, ShieldCheck,
  LogOut, ChevronLeft, Activity, Zap, Menu, X, Eye, Monitor, RefreshCw, Server
} from "lucide-react";
import { ReactNode, useState, useEffect } from "react";
import { FaDiscord } from "react-icons/fa";
import { useSession, useActiveGuild, useModerationAuthConfig, type ModerationGuild } from "../../hooks/use-moderation-api";
import { Button } from "../../components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { GuildSelection } from "./GuildSelection";
import "./moderation.css";
import animatedDragonLogo from "@assets/ezgif.com-video-to-gif-converter_1789791978054.gif";
import { DISCORD_INVITE } from "../../lib/public-constants";

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

function guildIconUrl(guild: ModerationGuild | undefined): string | null {
  if (!guild?.icon) return null;
  if (/^https?:\/\//i.test(guild.icon)) return guild.icon;
  return `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png?size=128`;
}

function inviteLabel(inviteUrl: string): string {
  try {
    const url = new URL(inviteUrl);
    return `${url.host}${url.pathname}`.replace(/\/$/, "");
  } catch {
    return inviteUrl;
  }
}

export function ModerationLayout({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const { session, loading, error, logout, retry } = useSession();
  const {
    authConfig,
    loading: authConfigLoading,
    error: authConfigError,
    retry: retryAuthConfig,
  } = useModerationAuthConfig();
  const { guildId, setGuildId, guilds } = useActiveGuild();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const activeGuild = guilds.find((guild) => guild.id === guildId);
  const activeGuildIcon = guildIconUrl(activeGuild);
  const botProfile = authConfig?.bot;

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location]);

  if (loading) {
    return (
      <div className="mod-shell dark flex min-h-[100dvh] items-center justify-center p-6">
        <div className="w-full max-w-sm space-y-5 rounded-2xl border border-border/70 bg-card/80 p-7 shadow-2xl">
          <div className="flex items-center gap-3">
            <div className="mod-brand-mark"><Eye className="h-5 w-5" aria-hidden="true" /></div>
            <div>
              <p className="mod-eyebrow">Oracolul Cenușii</p>
              <p className="text-sm text-muted-foreground">Se deschide consola</p>
            </div>
          </div>
          <div className="space-y-3" aria-label="Se încarcă">
            <div className="mod-skeleton h-3 w-2/3" />
            <div className="mod-skeleton h-3 w-full" />
            <div className="mod-skeleton h-24 w-full" />
          </div>
          <p className="font-mono text-[10px] tracking-[0.2em] text-muted-foreground">CONECTARE LA ORACOL...</p>
        </div>
      </div>
    );
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
          Oracolul nu poate fi contactat momentan ({error.message}). <br/>
          Piatra de suflete necesită o reconectare.
          </p>
          <Button onClick={() => retry()} className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90 font-medium tracking-wide" data-testid="button-retry-session">
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
        <div className="w-full max-w-md bg-card border border-border p-7 sm:p-9 rounded-2xl relative overflow-hidden mod-card mod-login-card shadow-2xl">
          <div className="mod-card-glow" />
          <div className="mod-login-card-line" aria-hidden="true" />
          <div className="relative">
          <div className="mb-7 flex items-center gap-3">
            <div className="mod-brand-mark overflow-hidden">
              <img src={animatedDragonLogo} alt="" className="mod-brand-logo" aria-hidden="true" />
            </div>
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
                Conectarea la serviciul de autentificare nu a putut fi verificată. Încearcă din nou.
              </div>
              <Button type="button" onClick={() => void retryAuthConfig()} variant="outline" className="w-full gap-2">
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

          <div className="mt-8 pt-6 border-t border-border/50">
            <Link href="~/joc" data-testid="link-game-guide-login" className="text-xs font-mono tracking-widest text-muted-foreground hover:text-primary transition-colors inline-flex items-center gap-2">
              <BookOpen className="w-4 h-4" /> GHIDUL JOCULUI
            </Link>
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
      />
    );
  }

  const navItems = [
    { href: "/", icon: Activity, label: "Ansamblu" },
    { href: "/automod", icon: Bot, label: "AutoMod & AI" },
    { href: "/protectie", icon: Shield, label: "Protecție Server" },
    { href: "/politici", icon: BookOpen, label: "Politici Generale" },
    { href: "/comenzi", icon: Zap, label: "Acțiuni Manuale" },
    { href: "/cazuri", icon: ShieldAlert, label: "Cazuri (Cases)" },
    { href: "/audit", icon: History, label: "Loguri & Audit" },
    { href: "/config", icon: Settings, label: "Configurare" },
  ];
  const botControlItems = [
    { href: "/bot?tab=channels", icon: Monitor, label: "Canale" },
    { href: "/bot?tab=tickets", icon: SlidersHorizontal, label: "Tichete" },
    { href: "/verificare", icon: ShieldCheck, label: "Verificare" },
    { href: "/bot?tab=messages", icon: Activity, label: "Mesaje" },
    { href: "/bot?tab=statistics", icon: Monitor, label: "Statistici" },
  ];

  return (
    <div className="mod-shell dark flex h-[100dvh] min-h-[100dvh] overflow-hidden">
      {/* Mobile overlay */}
      {mobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-background/80 backdrop-blur-sm z-40 md:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside aria-label="Navigare moderare" className={`
        mod-sidebar fixed inset-y-0 left-0 z-50 w-72 border-r border-border flex flex-col
        transition-transform duration-300 ease-in-out md:sticky md:top-0 md:h-[100dvh] md:translate-x-0 md:shrink-0
        ${mobileMenuOpen ? "translate-x-0" : "-translate-x-full"}
      `}>
        <div className="fire-toolbar mod-toolbar h-20 flex items-center justify-between px-5 border-b border-border/50 shrink-0">
          <div className="flex items-center gap-3 text-primary">
            <div className="mod-brand-mark overflow-hidden">
              {botProfile?.avatarUrl ? (
                <img src={botProfile.avatarUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <Eye className="w-5 h-5" aria-hidden="true" />
              )}
            </div>
            <div className="flex flex-col">
              <span className="max-w-[155px] truncate font-display font-semibold text-xl leading-none tracking-wide text-foreground">{botProfile?.name || "ORACOLUL"}</span>
              <span className="text-[10px] font-mono tracking-widest leading-none mt-1 opacity-80">BOT / CONSOLĂ</span>
            </div>
          </div>
          <button aria-label="Închide meniul" onClick={() => setMobileMenuOpen(false)} className="md:hidden text-muted-foreground hover:text-foreground p-2">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto py-6 px-4 flex flex-col gap-8">
          
          <div>
            <div className="text-[10px] font-mono tracking-widest text-muted-foreground mb-3 px-3 uppercase">
              Server Curent
            </div>
            <div className="px-2">
              <Select value={guildId || ""} onValueChange={setGuildId}>
                <SelectTrigger aria-label="Server curent" className="mod-select-trigger w-full bg-background/70 border-border/60 hover:border-primary/50 transition-colors" data-testid="select-active-guild">
                  <SelectValue placeholder="Selectează server" />
                </SelectTrigger>
                <SelectContent>
                  {guilds.map(g => (
                    <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <div className="text-[10px] font-mono tracking-widest text-muted-foreground mb-3 px-3 uppercase">
              Instrumente
            </div>
            <nav className="flex flex-col gap-1">
              {navItems.map(item => {
                const active = location === item.href || (item.href !== "/" && location.startsWith(item.href));
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    data-testid={`link-nav-${item.href === "/" ? "dashboard" : item.href.slice(1)}`}
                    className="mod-sidebar-item flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-secondary/50"
                    data-active={active}
                  >
                    <item.icon className="w-4 h-4 shrink-0" />
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>
          <div className="mod-control-nav">
            <div className="text-[10px] font-mono tracking-widest text-muted-foreground mb-3 px-3 uppercase">
              Control bot
            </div>
            <nav className="flex flex-col gap-1">
              {botControlItems.map(item => {
                const [itemPath] = item.href.split("?");
                const itemTab = new URLSearchParams(item.href.split("?")[1] ?? "").get("tab");
                const currentPath = location.split("?")[0];
                const currentTab = new URLSearchParams(location.split("?")[1] ?? "").get("tab");
                const active = currentPath === itemPath && (itemPath !== "/bot" || (itemTab ?? "channels") === (currentTab ?? "channels"));
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    data-testid={`link-nav-control-${item.label.toLowerCase()}`}
                    className="mod-sidebar-item mod-control-nav-item flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-secondary/50"
                    data-active={active}
                  >
                    <item.icon className="w-4 h-4 shrink-0" />
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>
        </div>

        <div className="p-4 border-t border-border/50 bg-background/50">
          <div className="flex items-center gap-2 mb-2">
            <a
              href={DISCORD_INVITE}
              target="_blank"
              rel="noopener noreferrer"
              className="flex min-w-0 flex-1 items-center gap-2 rounded-md border border-transparent px-2 py-1.5 text-left transition-colors hover:border-primary/20 hover:bg-secondary/50"
              title={`Deschide invitația ${activeGuild?.name || "serverului"}`}
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-primary/25 bg-primary/10 text-primary">
                {activeGuildIcon ? (
                  <img
                    src={activeGuildIcon}
                    alt=""
                    className="h-full w-full object-cover"
                    onError={(event) => { event.currentTarget.style.display = "none"; }}
                  />
                ) : (
                  <Server className="h-4 w-4" aria-hidden="true" />
                )}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-xs font-semibold tracking-wide text-foreground">
                  {activeGuild?.name || "Serverul meu"}
                </span>
                <span className="mt-0.5 block truncate font-mono text-[9px] tracking-wider text-muted-foreground">
                  {inviteLabel(DISCORD_INVITE)}
                </span>
              </span>
            </a>
            <button 
              onClick={() => logout()}
              aria-label="Deconectare"
              data-testid="button-logout"
              className="flex items-center justify-center p-2 text-destructive hover:bg-destructive/10 rounded-md transition-colors border border-transparent hover:border-destructive/20"
              title="Deconectare"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
       <main key={`guild-${guildId}`} className="flex h-[100dvh] min-h-0 flex-1 flex-col min-w-0 bg-background">
        <header className="fire-toolbar mod-toolbar mod-topbar h-16 border-b border-border/50 backdrop-blur flex items-center justify-between px-4 sm:px-6 shrink-0 md:hidden sticky top-0 z-30">
          <div className="flex items-center gap-2 text-primary">
              <div className="mod-brand-mark h-8 w-8 overflow-hidden rounded-lg">
                {botProfile?.avatarUrl ? (
                  <img src={botProfile.avatarUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <Eye className="w-4 h-4" aria-hidden="true" />
                )}
              </div>
              <span className="max-w-[170px] truncate font-display font-semibold text-lg text-foreground">{botProfile?.name || "ORACOLUL"}</span>
          </div>
          <button onClick={() => setMobileMenuOpen(true)} aria-label="Deschide meniul" aria-expanded={mobileMenuOpen} className="text-muted-foreground hover:text-foreground p-2 -mr-2">
             <Menu className="w-6 h-6" aria-hidden="true" />
          </button>
        </header>
        
        <div className="mod-page min-h-0 flex-1 overflow-x-hidden overflow-y-auto p-4 sm:p-6 md:p-8 relative">
          <div className="max-w-5xl mx-auto w-full">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
