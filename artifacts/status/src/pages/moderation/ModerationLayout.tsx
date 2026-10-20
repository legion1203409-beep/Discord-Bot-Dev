import { Link, useLocation, useSearch } from "wouter";
import { 
  ShieldAlert, Settings, Shield, Bot, History, BookOpen, SlidersHorizontal, ShieldCheck,
  LogOut, Activity, Zap, Menu, X, Eye, Monitor, Radio, RefreshCw, Server,
  FileText, Sparkles, MessageSquareWarning, Gavel, Wrench, Users, Trophy, Hammer,
} from "lucide-react";
import { ReactNode, useState, useEffect } from "react";
import { FaDiscord } from "react-icons/fa";
import robotMascot from "@assets/generated_images/oracolul-robot-mascot.png";
import { useSession, useActiveGuild, useModerationAuthConfig, type ModerationGuild } from "../../hooks/use-moderation-api";
import { Button } from "../../components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { GuildSelection } from "./GuildSelection";
import { BotInviteLink } from "../../components/moderation/BotInviteLink";
import { DiscordLoadingScreen } from "../../components/moderation/DiscordLoadingScreen";
import "./moderation.css";
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

function BotBrandImage() {
  return <img src={robotMascot} alt="" className="h-full w-full object-contain" />;
}

type ModerationNavItem = {
  href: string;
  icon: typeof Activity;
  label: string;
  testId?: string;
};

const moderationNavGroups: Array<{ id: string; label: string; items: ModerationNavItem[] }> = [
  {
    id: "overview",
    label: "Centru de comandă",
    items: [
      { href: "/", icon: Activity, label: "Privire generală" },
      { href: "/comenzi", icon: Zap, label: "Acțiuni manuale" },
    ],
  },
  {
    id: "protection",
    label: "Apărare",
    items: [
      { href: "/protectie", icon: Shield, label: "Protecție server" },
      { href: "/automod", icon: Bot, label: "AutoMod" },
      { href: "/ai", icon: Sparkles, label: "Moderare AI" },
      { href: "/anti-raid", icon: ShieldAlert, label: "Anti-Raid" },
      { href: "/anti-spam", icon: MessageSquareWarning, label: "Anti-Spam" },
      { href: "/anti-flood", icon: Activity, label: "Anti-Flood" },
      { href: "/comportament-suspect", icon: Eye, label: "Comportament suspect" },
    ],
  },
  {
    id: "moderation",
    label: "Intervenții și evidențe",
    items: [
      { href: "/politici", icon: BookOpen, label: "Politici" },
      { href: "/cazuri", icon: ShieldAlert, label: "Cazuri" },
      { href: "/audit", icon: History, label: "Jurnal de audit" },
    ],
  },
  {
    id: "configuration",
    label: "Reguli și configurare",
    items: [
      { href: "/config", icon: Settings, label: "Module" },
      { href: "/config/mesaje", icon: FileText, label: "Mesaje" },
      { href: "/config/avansat", icon: SlidersHorizontal, label: "Setări avansate" },
      { href: "/config/unelte", icon: Zap, label: "Unelte staff" },
      { href: "/config/cazuri-audit", icon: FileText, label: "Cazuri și audit" },
      { href: "/config/escaladare", icon: Gavel, label: "Escaladare" },
      { href: "/config/embeduri", icon: Sparkles, label: "Embed-uri" },
    ],
  },
  {
    id: "server-setup",
    label: "Configurare server",
    items: [{ href: "/pornire-server", icon: Hammer, label: "Ghid de pornire" }],
  },
  {
    id: "bot-control",
    label: "Servicii Discord",
    items: [
      { href: "/canale", icon: Radio, label: "Panouri și destinații", testId: "link-nav-control-canale" },
      { href: "/provisioning", icon: Wrench, label: "Canale și permisiuni", testId: "link-nav-control-provisioning" },
      { href: "/bot?tab=roles", icon: Users, label: "Roluri", testId: "link-nav-control-roluri" },
      { href: "/bot?tab=tickets", icon: SlidersHorizontal, label: "Tichete", testId: "link-nav-control-tichete" },
      { href: "/bot?tab=messages", icon: Activity, label: "Mesaje bot", testId: "link-nav-control-mesaje" },
      { href: "/bot?tab=statistics", icon: Monitor, label: "Statistici bot", testId: "link-nav-control-statistici" },
    ],
  },
  {
    id: "community",
    label: "Membri și progres",
    items: [
      { href: "/verificare", icon: ShieldCheck, label: "Verificare membri · staff", testId: "link-nav-control-verificare" },
      { href: "/ranguri-activitate", icon: Trophy, label: "Ranguri de activitate", testId: "link-nav-control-ranguri-activitate" },
    ],
  },
];

function isNavItemActive(href: string, location: string): boolean {
  const [pathname, query] = href.split("?");
  if (location.split("?")[0] !== pathname) return false;
  if (!query) return true;

  const expected = new URLSearchParams(query);
  const currentQuery = location.split("?")[1] ?? "";
  const current = new URLSearchParams(currentQuery);
  return Array.from(expected.entries()).every(([key, value]) => current.get(key) === value);
}

export function ModerationLayout({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const search = useSearch();
  const navLocation = `${location.split("?")[0]}${search ? `?${search.replace(/^\?/, "")}` : location.includes("?") ? `?${location.split("?")[1]}` : ""}`;
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
  }, [location, search]);

  useEffect(() => {
    if (!mobileMenuOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileMenuOpen(false);
    };
    const previous = document.body.style.overflow;
    if (window.matchMedia("(max-width: 767px)").matches) document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [mobileMenuOpen]);

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
          Oracolul nu poate fi contactat momentan ({error.message}). <br/>
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
            <div className="mod-brand-mark overflow-hidden">
              <BotBrandImage />
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
          {authConfig?.botInviteUrl && (
            <BotInviteLink href={authConfig.botInviteUrl} className="mt-3 w-full gap-2 py-5" />
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
        botInviteUrl={authConfig?.botInviteUrl}
      />
    );
  }

  return (
    <div className="mod-shell dark flex h-[100dvh] min-h-[100dvh] overflow-hidden">
      {/* Mobile overlay */}
      {mobileMenuOpen && (
        <div
          aria-hidden="true"
          className="fixed inset-0 bg-background/80 backdrop-blur-sm z-40 md:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside aria-label="Navigare moderare" id="mod-sidebar" {...(!mobileMenuOpen ? { "data-closed": "true" } : {})} className={`
        mod-sidebar fixed inset-y-0 left-0 z-50 w-72 border-r border-border flex flex-col
        transition-transform duration-300 ease-in-out md:sticky md:top-0 md:h-[100dvh] md:translate-x-0 md:shrink-0
        ${mobileMenuOpen ? "translate-x-0" : "-translate-x-full"}
      `}>
        <div className="fire-toolbar mod-toolbar h-20 flex items-center justify-between px-5 border-b border-border/50 shrink-0">
          <div className="flex items-center gap-3 text-primary">
            <div className="mod-brand-mark overflow-hidden">
              <BotBrandImage />
            </div>
            <div className="flex flex-col">
              <span className="max-w-[155px] truncate font-display font-semibold text-xl leading-none tracking-wide text-foreground">{botProfile?.name || "ORACOLUL"}</span>
              <span className="text-[10px] font-mono tracking-widest leading-none mt-1 opacity-80">BOT / CONSOLĂ</span>
            </div>
          </div>
          <button type="button" aria-label="Închide meniul" onClick={() => setMobileMenuOpen(false)} className="md:hidden rounded-md border border-transparent text-muted-foreground hover:border-border hover:text-foreground p-2 min-h-10 min-w-10 flex items-center justify-center">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="mod-sidebar-scroll-area min-h-0 flex-1 overflow-y-auto overscroll-contain py-4 px-3 flex flex-col gap-4">
          
          <div>
            <div className="text-[10px] font-mono tracking-widest text-muted-foreground mb-1 px-2.5 uppercase">
              Server Curent
            </div>
            <div className="px-1.5">
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
            <div className="mb-1 px-2.5 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
              Instrumente
            </div>
            <nav aria-label="Categorii de moderare" className="mod-sidebar-nav space-y-1">
              {moderationNavGroups.map((group) => {
                const controlGroup = group.id === "bot-control";
                return (
                  <section
                    key={group.id}
                    aria-labelledby={`nav-group-heading-${group.id}`}
                    className={controlGroup ? "mod-control-nav" : undefined}
                  >
                    <h3
                      id={`nav-group-heading-${group.id}`}
                      data-testid={`nav-group-${group.id}`}
                      className="flex min-h-8 items-center rounded-md px-2.5 py-1.5 text-[10px] font-mono font-medium uppercase tracking-[0.12em] text-muted-foreground"
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        {group.label}
                        <span className="text-[10px] text-muted-foreground/70">{String(group.items.length).padStart(2, "0")}</span>
                      </span>
                    </h3>
                    <div
                      id={`nav-group-${group.id}`}
                      className="mt-0.5 flex flex-col gap-0.5"
                    >
                      {group.items.map((item) => {
                        const active = isNavItemActive(item.href, navLocation);
                        const testId = item.testId ?? (controlGroup
                          ? `link-nav-control-${item.label.toLowerCase()}`
                          : `link-nav-${item.href === "/" ? "dashboard" : item.href.slice(1).replace(/\//g, "-")}`);
                        return (
                          <Link
                            key={item.href}
                            href={item.href}
                            onClick={() => setMobileMenuOpen(false)}
                            data-testid={testId}
                            aria-current={active ? "page" : undefined}
                            className={`mod-sidebar-item flex min-h-8 items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[13px] font-medium text-muted-foreground hover:bg-secondary/50 hover:text-foreground ${controlGroup ? "mod-control-nav-item" : ""}`}
                            data-active={active}
                          >
                            <item.icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                            <span className="truncate">{item.label}</span>
                          </Link>
                        );
                      })}
                    </div>
                  </section>
                );
              })}
            </nav>
          </div>
          <BotInviteLink href={authConfig?.botInviteUrl} className="w-full gap-2" />
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
              type="button"
              onClick={() => logout()}
              aria-label="Deconectare"
              data-testid="button-logout"
              className="flex min-h-10 min-w-10 items-center justify-center p-2 text-destructive hover:bg-destructive/10 rounded-md transition-colors border border-transparent hover:border-destructive/20"
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
                <BotBrandImage />
              </div>
              <span className="max-w-[170px] truncate font-display font-semibold text-lg text-foreground">{botProfile?.name || "ORACOLUL"}</span>
          </div>
          <button type="button" onClick={() => setMobileMenuOpen(true)} aria-label="Deschide meniul" aria-expanded={mobileMenuOpen} aria-controls="mod-sidebar" className="rounded-md border border-transparent text-muted-foreground hover:border-border hover:text-foreground p-2 -mr-2 min-h-10 min-w-10 flex items-center justify-center">
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
