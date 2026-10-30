import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  Bot,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  Clock,
  History,
  Settings,
  Shield,
  ShieldAlert,
  Server,
  PauseCircle,
  PlayCircle,
  XCircle,
  Zap,
} from "lucide-react";
import { useState } from "react";
import { Link } from "wouter";
import { useModerationConfig, useCases, useActiveGuild, useAuditLogs, useGameplayState } from "../../hooks/use-moderation-api";
import { Button } from "../../components/ui/button";
import { useToast } from "../../hooks/use-toast";
import { DISCORD_INVITE } from "../../lib/public-constants";
import { presentAuditActor, presentAuditLog } from "../../lib/moderation-audit";

export function DashboardOverview() {
  const { guildId, guilds } = useActiveGuild();
  const { data: config, loading: configLoading } = useModerationConfig(guildId);
  const { data: casesData, loading: casesLoading } = useCases(guildId, { limit: 10 });
  const { data: auditLogs, loading: auditLoading } = useAuditLogs(guildId);
  const {
    paused: gamePaused,
    loading: gameStateLoading,
    error: gameStateError,
    update: updateGameState,
    refetch: refetchGameState,
  } = useGameplayState(guildId);
  const { toast } = useToast();
  const [savingGameState, setSavingGameState] = useState(false);
  const activeGuild = guilds.find((guild) => guild.id === guildId);
  const activeGuildIcon = activeGuild?.icon
    ? (/^https?:\/\//i.test(activeGuild.icon)
      ? activeGuild.icon
      : `https://cdn.discordapp.com/icons/${activeGuild.id}/${activeGuild.icon}.png?size=128`)
    : null;

  if (!guildId) {
    return (
      <div className="flex min-h-[55vh] flex-col items-center justify-center rounded-2xl border border-dashed border-border/70 bg-card/30 p-8 text-center text-muted-foreground">
        <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary">
          <Shield className="h-7 w-7" aria-hidden="true" />
        </div>
        <p className="mod-eyebrow">Niciun server activ</p>
        <p className="mt-2 max-w-sm text-sm leading-relaxed">Selectează un server din meniul lateral pentru a deschide tabloul de operațiuni.</p>
      </div>
    );
  }

  if (configLoading || casesLoading || auditLoading) {
    return (
      <div className="space-y-7" aria-label="Se încarcă datele dashboardului">
        <div className="space-y-3">
          <div className="mod-skeleton h-3 w-32" />
          <div className="mod-skeleton h-12 w-72" />
          <div className="mod-skeleton h-4 w-full max-w-xl" />
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {[1, 2, 3].map((item) => <div key={item} className="mod-card h-36 rounded-2xl p-6"><div className="mod-skeleton h-full w-full" /></div>)}
        </div>
        <div className="grid gap-6 lg:grid-cols-[.85fr_1.15fr]">
          <div className="mod-card h-80 rounded-2xl" />
          <div className="mod-card h-80 rounded-2xl" />
        </div>
        <p className="font-mono text-[10px] tracking-[0.2em] text-muted-foreground">SE INIȚIALIZEAZĂ DATELE...</p>
      </div>
    );
  }

  const openCases = (casesData || []).filter((item) => item.status === "open").length;
  const recentLogs = (auditLogs || []).slice(0, 7);
  const visibleConfig = config;
  const protectionEnabled = visibleConfig?.protection?.enabled ?? false;
  const modules = [
    { key: "autoMod" as const, name: "AutoMod", description: "Filtre clasice și sincronizare Discord AutoMod nativ.", href: "/automod", active: Boolean(protectionEnabled && visibleConfig?.autoMod?.enabled), enabled: Boolean(visibleConfig?.autoMod?.enabled), parentEnabled: true, icon: Bot },
    { key: "wordFilter" as const, name: "Filtru cuvinte", description: "Cuvinte interzise și acțiunea aplicată la detectare.", href: "/automod", active: Boolean(protectionEnabled && visibleConfig?.autoMod?.enabled && visibleConfig?.autoMod?.wordFilter?.enabled), enabled: Boolean(visibleConfig?.autoMod?.wordFilter?.enabled), parentEnabled: Boolean(visibleConfig?.autoMod?.enabled), icon: BookOpen },
    { key: "linkBlock" as const, name: "Blocare linkuri", description: "Linkuri interzise și răspunsul automat asociat.", href: "/automod", active: Boolean(protectionEnabled && visibleConfig?.autoMod?.enabled && visibleConfig?.autoMod?.linkBlock?.enabled), enabled: Boolean(visibleConfig?.autoMod?.linkBlock?.enabled), parentEnabled: Boolean(visibleConfig?.autoMod?.enabled), icon: Zap },
    { key: "antiRaid" as const, name: "Anti-Raid", description: "Valuri de intrări și conturi prea noi.", href: "/anti-raid", active: Boolean(protectionEnabled && visibleConfig?.antiRaid?.enabled), enabled: Boolean(visibleConfig?.antiRaid?.enabled), parentEnabled: true, icon: ShieldAlert },
    { key: "antiSpam" as const, name: "Anti-Spam", description: "Mesaje, editări, mențiuni și emoji repetitive.", href: "/anti-spam", active: Boolean(protectionEnabled && visibleConfig?.antiSpam?.enabled), enabled: Boolean(visibleConfig?.antiSpam?.enabled), parentEnabled: true, icon: Activity },
    { key: "antiFlood" as const, name: "Anti-Flood", description: "Mesaje lungi și șiruri excesive.", href: "/anti-flood", active: Boolean(protectionEnabled && visibleConfig?.antiFlood?.enabled), enabled: Boolean(visibleConfig?.antiFlood?.enabled), parentEnabled: true, icon: Activity },
    { key: "suspiciousBehavior" as const, name: "Comportament suspect", description: "Alerte pentru activitate și schimbări neobișnuite.", href: "/comportament-suspect", active: Boolean(protectionEnabled && visibleConfig?.suspiciousBehavior?.enabled), enabled: Boolean(visibleConfig?.suspiciousBehavior?.enabled), parentEnabled: true, icon: ShieldAlert },
    { key: "ai" as const, name: "Moderare AI", description: "Analiză inteligentă separată de AutoMod.", href: "/ai", active: Boolean(protectionEnabled && visibleConfig?.ai?.enabled), enabled: Boolean(visibleConfig?.ai?.enabled), parentEnabled: true, icon: Bot },
  ];
  const automatedModuleStatus = (enabled: boolean, parentEnabled = true) => {
    if (!enabled) return { text: "Inactiv", tone: "inactive" as const };
    if (!parentEnabled) return { text: "Configurat · AutoMod oprit", tone: "paused" as const };
    if (!protectionEnabled) return { text: "Configurat · pauză globală", tone: "paused" as const };
    return { text: "Activ", tone: "active" as const };
  };
  const standaloneModuleStatus = (enabled: boolean) => ({
    text: enabled ? "Activ" : "Inactiv",
    tone: enabled ? "active" as const : "inactive" as const,
  });
  const autoModStatus = automatedModuleStatus(Boolean(visibleConfig?.autoMod?.enabled));
  const wordFilterStatus = automatedModuleStatus(
    Boolean(visibleConfig?.autoMod?.wordFilter?.enabled),
    Boolean(visibleConfig?.autoMod?.enabled),
  );
  const linkBlockStatus = automatedModuleStatus(
    Boolean(visibleConfig?.autoMod?.linkBlock?.enabled),
    Boolean(visibleConfig?.autoMod?.enabled),
  );
  const directoryGroups = [
    {
      title: "Protecție automată",
      intro: "Apărări care procesează evenimentele serverului.",
      links: [
        { title: "Protecție globală", href: "/protectie", ...standaloneModuleStatus(protectionEnabled) },
        { title: "AutoMod", href: "/automod", ...autoModStatus },
        { title: "Filtru de cuvinte", href: "/automod", ...wordFilterStatus },
        { title: "Blocare linkuri", href: "/automod", ...linkBlockStatus },
        { title: "Moderare AI", href: "/ai", ...automatedModuleStatus(Boolean(visibleConfig?.ai?.enabled)) },
        { title: "Anti-Raid", href: "/anti-raid", ...automatedModuleStatus(Boolean(visibleConfig?.antiRaid?.enabled)) },
        { title: "Anti-Spam", href: "/anti-spam", ...automatedModuleStatus(Boolean(visibleConfig?.antiSpam?.enabled)) },
        { title: "Anti-Flood", href: "/anti-flood", ...automatedModuleStatus(Boolean(visibleConfig?.antiFlood?.enabled)) },
        { title: "Comportament suspect", href: "/comportament-suspect", ...automatedModuleStatus(Boolean(visibleConfig?.suspiciousBehavior?.enabled)) },
      ],
    },
    {
      title: "Moderare și evidențe",
      intro: "Reguli, intervenții și urmărirea deciziilor staff-ului.",
      links: [
        { title: "Roluri și canale", href: "/sanctiuni/roluri-canale", text: "Gestionare", tone: "info" as const },
        { title: "Acțiuni manuale", href: "/comenzi", ...standaloneModuleStatus(Boolean(visibleConfig?.manualTools?.enabled)) },
        { title: "Comenzi staff", href: "/sanctiuni/comenzi", text: "Configurare", tone: "info" as const },
        { title: "Cazuri", href: "/cazuri", ...standaloneModuleStatus(true) },
        { title: "Jurnal de audit", href: "/audit", ...standaloneModuleStatus(Boolean(visibleConfig?.audit?.enabled)) },
        { title: "Escaladare", href: "/sanctiuni/escaladare", ...standaloneModuleStatus(Boolean(visibleConfig?.escalation?.enabled)) },
        { title: "Program", href: "/sanctiuni/program", text: "Configurare", tone: "info" as const },
        { title: "Embed-uri", href: "/config/embeduri", ...standaloneModuleStatus(Boolean(visibleConfig?.embeds?.enabled)) },
        { title: "Setări cazuri și audit", href: "/jurnale/cazuri", text: "Configurare", tone: "info" as const },
        { title: "Jurnale de activitate", href: "/jurnale/activitate", ...standaloneModuleStatus(Boolean(visibleConfig?.activityLog?.enabled)) },
        { title: "Mesaje de moderare", href: "/config/mesaje", text: "Configurare", tone: "info" as const },
        { title: "Setări avansate", href: "/config/avansat", text: "Configurare", tone: "info" as const },
        { title: "Toate modulele", href: "/config", text: "Configurare", tone: "info" as const },
      ],
    },
    {
      title: "Servicii Discord",
      intro: "Panouri, automatizări și instrumente comunitare.",
      links: [
        { title: "Canale și destinații", href: "/canale", text: "Gestionare", tone: "info" as const },
        { title: "Provisioning", href: "/provisioning", text: "Gestionare", tone: "info" as const },
        { title: "Roluri", href: "/bot?tab=roles", text: "Gestionare", tone: "info" as const },
        { title: "Tichete", href: "/bot?tab=tickets", text: "Gestionare", tone: "info" as const },
        { title: "Mesaje bot", href: "/bot?tab=messages", text: "Gestionare", tone: "info" as const },
        { title: "Statistici bot", href: "/bot?tab=statistics", text: "Vizualizare", tone: "info" as const },
      ],
    },
    {
      title: "Membri și activitate",
      intro: "Experiența noilor membri și progresul comunității.",
      links: [
        { title: "Verificare membri", href: "/verificare", text: "Configurare", tone: "info" as const },
        { title: "Verificare manuală", href: "/verificare/membri", text: "Membri și roluri", tone: "info" as const },
        { title: "Ranguri de activitate", href: "/ranguri-activitate", text: "Configurare", tone: "info" as const },
        { title: "Pornire server", href: "/pornire-server", text: "Ghid de configurare", tone: "info" as const },
      ],
    },
  ];

  const toggleGameState = async () => {
    if (gamePaused === null) return;
    const nextPaused = !gamePaused;
    if (nextPaused && !window.confirm("Oprești activitățile jocului pe acest server? Evenimentele, luptele și recompensele vor fi suspendate.")) return;
    setSavingGameState(true);
    try {
      await updateGameState(nextPaused);
      toast({
        title: nextPaused ? "Joc oprit" : "Joc repornit",
        description: nextPaused
          ? "Activitățile jocului sunt suspendate. Oracle AI rămâne separat și nu este oprit."
          : "Activitățile jocului pot porni din nou.",
      });
    } catch (error: any) {
      toast({ variant: "destructive", title: "Starea jocului nu a putut fi schimbată", description: error?.message ?? "Încearcă din nou." });
    } finally {
      setSavingGameState(false);
    }
  };

  return (
    <div className="space-y-8 pb-10 animate-stagger-1">
      <a
        href={DISCORD_INVITE}
        target="_blank"
        rel="noopener noreferrer"
        className="ui-feedback group flex w-full max-w-sm items-center gap-3 rounded-xl border border-primary/30 bg-gradient-to-br from-primary/10 via-card/80 to-background/80 px-3 py-3 shadow-lg transition-all hover:-translate-y-0.5 hover:border-primary/60 hover:shadow-[0_8px_20px_rgba(214,84,81,0.15)]"
        title={`Deschide invitația ${activeGuild?.name || "serverului"}`}
        data-testid="link-dashboard-server-invite"
      >
        <span className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-primary/40 bg-background/80 text-primary shadow-inner relative">
          <div className="absolute inset-0 bg-primary/5 group-hover:bg-primary/10 transition-colors" />
          {activeGuildIcon ? (
            <img
              src={activeGuildIcon}
              alt=""
              className="h-full w-full object-cover relative z-10"
              onError={(event) => { event.currentTarget.style.display = "none"; }}
            />
          ) : (
            <Server className="h-6 w-6 relative z-10" aria-hidden="true" />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-mono text-[9px] uppercase tracking-[0.16em] text-primary/80">Serverul oficial</span>
          <strong className="block truncate font-display text-lg font-medium text-foreground">{activeGuild?.name || "Serverul meu"}</strong>
          <span className="block truncate font-mono text-[10px] tracking-wider text-muted-foreground">{DISCORD_INVITE.replace(/^https?:\/\//, "")}</span>
        </span>
        <ArrowUpRight className="h-4 w-4 shrink-0 text-primary transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" aria-hidden="true" />
      </a>

      <header className="flex flex-col gap-5 border-b border-border/60 pb-7 md:flex-row md:items-end md:justify-between animate-stagger-2">
        <div>
          <div className="mod-status-line mb-3">Sesiune autentificată</div>
          <h1 className="mod-heading text-5xl text-foreground sm:text-6xl">{activeGuild?.name || "Dashboard"}</h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Consola operatorului pentru gestionarea securității. Orice modificare se aplică instantaneu în regat.
          </p>
        </div>
        <Link href="/config" data-testid="link-dashboard-settings" className="inline-flex w-fit items-center gap-2 rounded-lg border border-border bg-card/70 px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:border-primary/50 hover:bg-primary/10">
          <Settings className="h-4 w-4 text-primary" aria-hidden="true" /> Configurare <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
        </Link>
      </header>

      <section aria-label="Director capabilități" className="animate-stagger-3 space-y-4" data-testid="dashboard-capability-directory">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border/60 pb-3">
          <div>
            <p className="mod-eyebrow">Hartă operațională</p>
            <h2 className="mod-heading mt-1 text-2xl">Toate capabilitățile Oracolului</h2>
          </div>
          <Link href="/config" data-testid="link-dashboard-module-settings" className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-border px-3 text-sm text-foreground hover:border-primary/50 hover:bg-primary/5">
            Module și activare <ArrowUpRight className="h-4 w-4 text-primary" aria-hidden="true" />
          </Link>
        </div>
        <div className="grid gap-4 xl:grid-cols-2">
          {directoryGroups.map((group) => (
            <section key={group.title} className="mod-card min-w-0 rounded-2xl p-4 sm:p-5" data-testid={`directory-group-${group.title.toLowerCase().replaceAll(" ", "-")}`}>
              <div className="mb-4 border-b border-border/60 pb-3">
                <h3 className="font-display text-lg font-semibold text-foreground">{group.title}</h3>
                <p className="mt-1 text-xs text-muted-foreground">{group.intro}</p>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {group.links.map((item) => (
                  <Link key={`${item.href}-${item.title}`} href={item.href} data-testid={`link-directory-${item.title.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-")}`} className="group flex min-h-12 min-w-0 items-center justify-between gap-3 rounded-lg border border-border/60 bg-background/45 px-3 py-2.5 transition-colors hover:border-primary/40 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-foreground">{item.title}</span>
                      <span className={`mt-1 block font-mono text-[9px] uppercase tracking-[0.12em] ${
                        item.tone === "active" ? "text-primary" :
                          item.tone === "paused" ? "text-amber-500" :
                            item.tone === "inactive" ? "text-muted-foreground" : "text-primary/70"
                      }`}>{item.text}</span>
                    </span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" aria-hidden="true" />
                  </Link>
                ))}
              </div>
            </section>
          ))}
        </div>
      </section>

      <section
        aria-label="Protecție globală"
        className={`animate-stagger-3 flex flex-col gap-5 rounded-2xl border p-5 shadow-lg sm:flex-row sm:items-center sm:justify-between sm:p-6 ${
          protectionEnabled
            ? "border-primary/30 bg-gradient-to-r from-primary/10 via-card/90 to-background/80 shadow-primary/5"
            : "border-amber-500/40 bg-gradient-to-r from-amber-500/10 via-card/90 to-background/80 shadow-amber-950/10"
        }`}
      >
        <div className="flex items-start gap-4">
          <span className={`mt-0.5 rounded-xl p-3 ${protectionEnabled ? "bg-primary/10 text-primary" : "bg-amber-500/10 text-amber-600"}`}>
            <Shield className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <p className="mod-eyebrow">Protecție globală · serverul selectat</p>
            <h2 className="mt-1 font-display text-2xl text-foreground">
              Protecția automată este {protectionEnabled ? "pornită" : "oprită"}
            </h2>
            <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              {protectionEnabled
                ? "Modulele automate activate pot procesa evenimentele acestui server."
                : "Modulele își păstrează setările, dar nu procesează evenimente până când pornești din nou protecția."}
            </p>
          </div>
        </div>
        <Link
          href="/protectie"
          className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-lg border border-border px-4 text-sm font-semibold text-foreground transition-colors hover:border-primary/40 hover:bg-primary/5"
          data-testid="link-dashboard-global-protection"
        >
          Gestionează protecția
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </section>

      <section
        className={`animate-stagger-4 flex flex-col gap-5 rounded-2xl border p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6 ${
          gamePaused === true
            ? "border-destructive/40 bg-destructive/5"
            : gamePaused === false
              ? "border-primary/25 bg-primary/5"
              : "border-amber-500/40 bg-amber-500/5"
        }`}
        aria-label="Control stare joc"
      >
        <div className="flex items-start gap-4">
          <span className={`mt-0.5 rounded-xl p-3 ${
            gamePaused === true
              ? "bg-destructive/10 text-destructive"
              : gamePaused === false
                ? "bg-primary/10 text-primary"
                : "bg-amber-500/10 text-amber-600"
          }`}>
            {gamePaused === true
              ? <PlayCircle className="h-5 w-5" aria-hidden="true" />
              : gamePaused === false
                ? <PauseCircle className="h-5 w-5" aria-hidden="true" />
                : <AlertTriangle className="h-5 w-5" aria-hidden="true" />}
          </span>
          <div>
            <p className="mod-eyebrow">
              {gamePaused === null
                ? gameStateLoading ? "Se încarcă starea jocului" : "Stare necunoscută"
                : gamePaused ? "Joc suspendat" : "Joc activ"}
            </p>
            <h2 className="mt-1 font-display text-2xl text-foreground">
              {gamePaused === null
                ? "Starea jocului nu este confirmată"
                : gamePaused ? "Activitățile sunt oprite" : "Regatul rulează normal"}
            </h2>
            <p className="mt-1 max-w-xl text-sm leading-relaxed text-muted-foreground">
              {gamePaused === null
                ? "Starea nu este disponibilă momentan; comanda de oprire sau repornire este dezactivată până la confirmarea serverului."
                : gamePaused
                  ? "Evenimentele, luptele, cuferele și recompensele sunt blocate până la repornire."
                  : "Poți suspenda temporar activitățile jocului fără să oprești moderarea sau Oracle AI."}
            </p>
            {gameStateError && (
              <div role="alert" className="mt-3 flex flex-wrap items-center gap-3 text-sm text-destructive">
                <span>Nu am putut confirma starea jocului. {gameStateError.message}</span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => void refetchGameState()}
                  disabled={gameStateLoading}
                  data-testid="button-gameplay-state-retry"
                >
                  {gameStateLoading ? "Se reîncarcă…" : "Reîncearcă"}
                </Button>
              </div>
            )}
          </div>
        </div>
        <Button
          type="button"
          variant={gamePaused === true ? "default" : "destructive"}
          className="shrink-0 gap-2"
          onClick={() => void toggleGameState()}
          disabled={gameStateLoading || gamePaused === null || savingGameState}
          data-testid="button-gameplay-state-toggle"
        >
          {gamePaused === true
            ? <PlayCircle className="h-4 w-4" aria-hidden="true" />
            : <PauseCircle className="h-4 w-4" aria-hidden="true" />}
          {savingGameState
            ? "Se schimbă..."
            : gamePaused === null
              ? gameStateLoading ? "Se încarcă starea…" : "Stare necunoscută"
              : gamePaused ? "Pornește jocul" : "Oprește jocul"}
        </Button>
      </section>

      <section aria-label="Indicatori principali" className="grid gap-4 md:grid-cols-3 animate-stagger-5">
        <div className="mod-card group rounded-2xl p-5 sm:p-6">
          <div className="flex items-start justify-between">
            <span className="mod-eyebrow text-muted-foreground">Cazuri deschise</span>
            <span className={`rounded-lg p-2.5 ${openCases > 0 ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary"}`}><AlertTriangle className="h-4 w-4" aria-hidden="true" /></span>
          </div>
          <div className="mt-7 flex items-end justify-between gap-3">
            <strong className="font-display text-5xl font-semibold text-foreground">{openCases}</strong>
            <span className="mb-1 flex items-center gap-1 text-xs text-muted-foreground"><Clock className="h-3.5 w-3.5" aria-hidden="true" /> revizuire</span>
          </div>
          <div className="mt-5 h-1 overflow-hidden rounded-full bg-secondary"><div className={`h-full rounded-full ${openCases ? "w-2/3 bg-destructive" : "w-1/4 bg-primary"}`} /></div>
        </div>

        <div className="mod-card group rounded-2xl p-5 sm:p-6">
          <div className="flex items-start justify-between">
            <span className="mod-eyebrow text-muted-foreground">Scut AutoMod</span>
            <span className={`rounded-lg p-2.5 ${protectionEnabled && visibleConfig?.autoMod?.enabled ? "bg-primary/10 text-primary" : "bg-secondary text-muted-foreground"}`}><Shield className="h-4 w-4" aria-hidden="true" /></span>
          </div>
          <div className="mt-7 flex items-end justify-between gap-3">
            <strong className="font-display text-4xl font-semibold text-foreground">{protectionEnabled && visibleConfig?.autoMod?.enabled ? "Activ" : "Oprit"}</strong>
            <span className="mb-1 text-xs text-muted-foreground">monitorizare live</span>
          </div>
          <div className="mt-5 flex items-center gap-2 text-xs text-muted-foreground"><span className={`h-1.5 w-1.5 rounded-full ${protectionEnabled && visibleConfig?.autoMod?.enabled ? "bg-primary" : "bg-muted-foreground"}`} /> reguli clasice</div>
        </div>

        <div className="mod-card group rounded-2xl p-5 sm:p-6">
          <div className="flex items-start justify-between">
            <span className="mod-eyebrow text-muted-foreground">Loguri audit azi</span>
            <span className="rounded-lg bg-secondary p-2.5 text-primary"><Activity className="h-4 w-4" aria-hidden="true" /></span>
          </div>
          <div className="mt-7 flex items-end justify-between gap-3">
            <strong className="font-display text-5xl font-semibold text-foreground">{auditLogs?.length || 0}</strong>
            <span className="mb-1 text-xs text-muted-foreground">evenimente</span>
          </div>
          <div className="mt-5 flex h-1 items-end gap-1" aria-hidden="true">
            {[35, 58, 42, 76, 48, 86, 63, 72, 54, 92, 68, 80].map((height, index) => <span key={index} className="flex-1 rounded-full bg-primary/60" style={{ height: `${height}%` }} />)}
          </div>
        </div>
      </section>

      <div data-testid="dashboard-columns" className="grid gap-6 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <section className="min-w-0 space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border/60 pb-3">
            <div><p className="mod-eyebrow">Sisteme</p><h2 className="mod-heading mt-1 text-2xl">Module de Protecție</h2></div>
            <Link href="/protectie" data-testid="link-dashboard-protection" className="inline-flex items-center gap-1 text-xs font-mono tracking-widest text-primary hover:text-primary/80 transition-colors">GESTIONEAZĂ <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" /></Link>
          </div>
          <div className="grid gap-3 2xl:grid-cols-2">
            {modules.map((mod) => (
              <article key={mod.key} className="mod-card mod-card-interactive flex min-w-0 items-start gap-3 p-4" data-testid={`card-module-${mod.key}`}>
                <div className={`shrink-0 rounded-lg border p-2.5 transition-colors ${mod.active ? "border-primary/30 bg-primary/10 text-primary" : "border-transparent bg-secondary text-muted-foreground"}`}><mod.icon className="h-4 w-4" aria-hidden="true" /></div>
                <Link href={mod.href} className="min-w-0 flex-1 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50" data-testid={`link-module-${mod.key}`}>
                  <h3 className="flex items-center gap-1 text-sm font-medium leading-snug text-foreground">{mod.name}<ChevronRight className="h-3.5 w-3.5 shrink-0 text-primary/70" aria-hidden="true" /></h3>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{mod.description}</p>
                  <p className={`mt-2 flex items-center gap-1 font-mono text-[10px] tracking-wider ${mod.active ? "text-primary" : mod.enabled ? "text-amber-500" : "text-muted-foreground"}`}>
                    {mod.active ? <CheckCircle2 className="h-3 w-3 shrink-0" aria-hidden="true" /> : mod.enabled ? <PauseCircle className="h-3 w-3 shrink-0" aria-hidden="true" /> : <XCircle className="h-3 w-3 shrink-0" aria-hidden="true" />}
                    {mod.active ? "ACTIV" : mod.enabled && !protectionEnabled ? "CONFIGURAT · PROTECȚIA GLOBALĂ OPRITĂ" : mod.enabled && !mod.parentEnabled ? "CONFIGURAT · AUTOMOD OPRIT" : "INACTIV"}
                  </p>
                </Link>
              </article>
            ))}
          </div>
        </section>

        <section className="min-w-0 space-y-4">
          <div className="flex items-end justify-between border-b border-border/60 pb-3">
            <div><p className="mod-eyebrow">Jurnal</p><h2 className="mod-heading mt-1 text-2xl">Activitate Recentă</h2></div>
            <Link href="/audit" data-testid="link-dashboard-audit" className="inline-flex items-center gap-1 text-xs font-mono tracking-widest text-primary hover:text-primary/80 transition-colors">VEZI TOT <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" /></Link>
          </div>
          <div className="mod-card overflow-hidden p-1.5 shadow-lg shadow-black/40">
            {recentLogs.length > 0 ? (
              <div className="divide-y divide-border/40">
                {recentLogs.map((log: any, index: number) => (
                  <div key={log.id} className="flex gap-3 rounded-xl p-3.5 transition-colors hover:bg-secondary/45 group" data-testid={`row-dashboard-audit-${index}`}>
                    <div className="mt-2 h-2 w-2 shrink-0 rounded-full bg-primary ring-4 ring-primary/10 group-hover:ring-primary/20 transition-all" />
                    {(() => {
                      const presentation = presentAuditLog(log);
                      return (
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm">
                            <strong className="font-medium text-foreground">{presentAuditActor(log)}</strong>
                            <span className="mx-1 text-muted-foreground">·</span>
                            <span className="text-primary">{presentation.title}</span>
                          </p>
                          <p className="mt-1 truncate text-xs text-muted-foreground">{presentation.details}</p>
                        </div>
                      );
                    })()}
                    <time className="shrink-0 font-mono text-[10px] text-muted-foreground" dateTime={log.createdAt}>{new Date(log.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3 p-10 text-center text-muted-foreground"><History className="h-8 w-8 opacity-30" aria-hidden="true" /><span className="font-mono text-[10px] tracking-[0.16em]">NICIO ACTIVITATE ÎNREGISTRATĂ RECENT.</span></div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}