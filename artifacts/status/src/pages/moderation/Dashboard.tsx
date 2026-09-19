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
  XCircle,
  Zap,
} from "lucide-react";
import { useState } from "react";
import { Link } from "wouter";
import { useModerationConfig, useCases, useActiveGuild, useAuditLogs } from "../../hooks/use-moderation-api";
import { Switch } from "../../components/ui/switch";
import { useToast } from "../../hooks/use-toast";
import { DISCORD_INVITE } from "../../lib/public-constants";

type ProtectionModuleKey = "wordFilter" | "linkBlock" | "antiRaid" | "antiSpam" | "antiFlood" | "ai";

export function DashboardOverview() {
  const { guildId, guilds } = useActiveGuild();
  const { data: config, loading: configLoading, update: updateModerationConfig } = useModerationConfig(guildId);
  const { data: casesData, loading: casesLoading } = useCases(guildId, { limit: 10 });
  const { data: auditLogs, loading: auditLoading } = useAuditLogs(guildId);
  const { toast } = useToast();
  const [savingModule, setSavingModule] = useState<string | null>(null);
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
  const protectionEnabled = config?.protection?.enabled ?? true;
  const modules = [
    { key: "wordFilter" as const, name: "Filtru Cuvinte", active: Boolean(protectionEnabled && config?.autoMod?.enabled && config?.autoMod?.wordFilter?.enabled), enabled: Boolean(config?.autoMod?.enabled && config?.autoMod?.wordFilter?.enabled), icon: BookOpen },
    { key: "linkBlock" as const, name: "Blocare Linkuri", active: Boolean(protectionEnabled && config?.autoMod?.enabled && config?.autoMod?.linkBlock?.enabled), enabled: Boolean(config?.autoMod?.enabled && config?.autoMod?.linkBlock?.enabled), icon: Zap },
    { key: "antiRaid" as const, name: "Anti-Raid", active: Boolean(protectionEnabled && config?.antiRaid?.enabled), enabled: Boolean(config?.antiRaid?.enabled), icon: ShieldAlert },
    { key: "antiSpam" as const, name: "Anti-Spam", active: Boolean(protectionEnabled && config?.antiSpam?.enabled), enabled: Boolean(config?.antiSpam?.enabled), icon: Activity },
    { key: "antiFlood" as const, name: "Anti-Flood", active: Boolean(protectionEnabled && config?.antiFlood?.enabled), enabled: Boolean(config?.antiFlood?.enabled), icon: Activity },
    { key: "ai" as const, name: "Inteligență AI", active: Boolean(protectionEnabled && config?.ai?.enabled), enabled: Boolean(config?.ai?.enabled), icon: Bot },
  ];

  const saveProtectionChange = async (
    nextConfig: any,
    key: string,
    description: string,
  ) => {
    if (!config || savingModule) return;
    setSavingModule(key);
    try {
      await updateModerationConfig(nextConfig);
      toast({ title: "Setare actualizată", description });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Setarea nu a putut fi salvată",
        description: error?.message ?? "Încearcă din nou.",
      });
    } finally {
      setSavingModule(null);
    }
  };

  const toggleProtection = (enabled: boolean) => {
    if (!config) return;
    void saveProtectionChange(
      { ...config, protection: { ...config.protection, enabled } },
      "protection",
      enabled ? "Toate modulele de protecție sunt disponibile." : "Toate modulele de protecție sunt oprite.",
    );
  };

  const toggleModule = (key: ProtectionModuleKey, enabled: boolean) => {
    if (!config) return;
    const nextConfig = { ...config };
    if (key === "wordFilter" || key === "linkBlock") {
      nextConfig.autoMod = {
        ...config.autoMod,
        enabled: enabled ? true : config.autoMod?.enabled,
        [key]: { ...config.autoMod?.[key], enabled },
      };
    } else {
      nextConfig[key] = { ...config[key], enabled };
    }
    void saveProtectionChange(nextConfig, key, `${key} este acum ${enabled ? "activ" : "oprit"}.`);
  };

  return (
    <div className="space-y-8 pb-10 animate-in fade-in duration-500">
      <a
        href={DISCORD_INVITE}
        target="_blank"
        rel="noopener noreferrer"
        className="group flex w-full max-w-sm items-center gap-3 rounded-xl border border-primary/30 bg-gradient-to-br from-primary/20 via-card/90 to-background/80 px-3 py-3 shadow-lg transition-all hover:-translate-y-0.5 hover:border-primary/60 hover:shadow-primary/10"
        title={`Deschide invitația ${activeGuild?.name || "serverului"}`}
        data-testid="link-dashboard-server-invite"
      >
        <span className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-primary/40 bg-background/80 text-primary shadow-inner">
          {activeGuildIcon ? (
            <img
              src={activeGuildIcon}
              alt=""
              className="h-full w-full object-cover"
              onError={(event) => { event.currentTarget.style.display = "none"; }}
            />
          ) : (
            <Server className="h-6 w-6" aria-hidden="true" />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-mono text-[9px] uppercase tracking-[0.16em] text-primary/80">Serverul oficial</span>
          <strong className="block truncate font-display text-lg font-medium text-foreground">{activeGuild?.name || "Serverul meu"}</strong>
          <span className="block truncate font-mono text-[10px] tracking-wider text-muted-foreground">{DISCORD_INVITE.replace(/^https?:\/\//, "")}</span>
        </span>
        <ArrowUpRight className="h-4 w-4 shrink-0 text-primary transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" aria-hidden="true" />
      </a>

      <header className="flex flex-col gap-5 border-b border-border/60 pb-7 md:flex-row md:items-end md:justify-between">
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

      <section aria-label="Indicatori principali" className="grid gap-4 md:grid-cols-3">
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
            <span className={`rounded-lg p-2.5 ${protectionEnabled && config?.autoMod?.enabled ? "bg-primary/10 text-primary" : "bg-secondary text-muted-foreground"}`}><Shield className="h-4 w-4" aria-hidden="true" /></span>
          </div>
          <div className="mt-7 flex items-end justify-between gap-3">
            <strong className="font-display text-4xl font-semibold text-foreground">{protectionEnabled && config?.autoMod?.enabled ? "Activ" : "Oprit"}</strong>
            <span className="mb-1 text-xs text-muted-foreground">monitorizare live</span>
          </div>
          <div className="mt-5 flex items-center gap-2 text-xs text-muted-foreground"><span className={`h-1.5 w-1.5 rounded-full ${protectionEnabled && config?.autoMod?.enabled ? "bg-primary" : "bg-muted-foreground"}`} /> reguli clasice</div>
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

      <div className="grid gap-6 lg:grid-cols-[.9fr_1.1fr]">
        <section className="space-y-4">
          <div className="flex items-end justify-between border-b border-border/60 pb-3">
            <div><p className="mod-eyebrow">Sisteme</p><h2 className="mod-heading mt-1 text-2xl">Module de Protecție</h2></div>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <span>{protectionEnabled ? "ACTIVĂ" : "OPRITĂ"}</span>
                <Switch
                  checked={protectionEnabled}
                  onCheckedChange={toggleProtection}
                  disabled={savingModule !== null}
                  aria-label="Activează sau oprește toată protecția"
                />
              </label>
              <Link href="/protectie" data-testid="link-dashboard-protection" className="inline-flex items-center gap-1 text-xs font-mono tracking-widest text-primary hover:text-primary/80">GESTIONEAZĂ <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" /></Link>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {modules.map((mod) => (
              <div key={mod.name} className="mod-card flex items-center gap-3 rounded-xl p-4 transition-colors hover:border-primary/30" data-testid={`card-module-${mod.name.toLowerCase().replaceAll(" ", "-")}`}>
                <div className={`rounded-lg border p-2.5 ${mod.active ? "border-primary/30 bg-primary/10 text-primary" : "border-transparent bg-secondary text-muted-foreground"}`}><mod.icon className="h-4 w-4" aria-hidden="true" /></div>
                <div className="min-w-0 flex-1"><div className="truncate text-sm font-medium text-foreground">{mod.name}</div><div className={`mt-1 flex items-center gap-1 font-mono text-[10px] tracking-widest ${mod.active ? "text-primary" : "text-muted-foreground"}`}>{mod.active ? <CheckCircle2 className="h-3 w-3" aria-hidden="true" /> : <XCircle className="h-3 w-3" aria-hidden="true" />} {mod.active ? "ACTIV" : "INACTIV"}</div></div>
                <Switch
                  checked={protectionEnabled && mod.enabled}
                  onCheckedChange={(enabled) => toggleModule(mod.key, enabled)}
                  disabled={!protectionEnabled || savingModule !== null}
                  aria-label={`${mod.name}: activează sau oprește`}
                />
              </div>
            ))}
          </div>
        </section>

        <section className="space-y-4">
          <div className="flex items-end justify-between border-b border-border/60 pb-3">
            <div><p className="mod-eyebrow">Jurnal</p><h2 className="mod-heading mt-1 text-2xl">Activitate Recentă</h2></div>
            <Link href="/audit" data-testid="link-dashboard-audit" className="inline-flex items-center gap-1 text-xs font-mono tracking-widest text-primary hover:text-primary/80">VEZI TOT <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" /></Link>
          </div>
          <div className="mod-card overflow-hidden rounded-2xl p-1.5">
            {recentLogs.length > 0 ? (
              <div className="divide-y divide-border/40">
                {recentLogs.map((log: any, index: number) => (
                  <div key={index} className="flex gap-3 rounded-xl p-3.5 transition-colors hover:bg-secondary/45" data-testid={`row-dashboard-audit-${index}`}>
                    <div className="mt-2 h-2 w-2 shrink-0 rounded-full bg-primary ring-4 ring-primary/10" />
                    <div className="min-w-0 flex-1"><p className="truncate text-sm"><strong className="font-medium text-foreground">{log.actorId || "Sistem"}</strong><span className="mx-1 text-muted-foreground">a declanșat</span><span className="text-primary">{log.action || log.type}</span></p><p className="mt-1 truncate text-xs text-muted-foreground">{log.reason || log.details || "Fără detalii suplimentare"}</p></div>
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