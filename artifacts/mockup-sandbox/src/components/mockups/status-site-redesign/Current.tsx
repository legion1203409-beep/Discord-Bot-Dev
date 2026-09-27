import { useState } from "react";
import {
  Activity, AlertTriangle, ArrowUpRight, Bot, BookOpen, CheckCircle2, ChevronRight,
  Clock, History, Settings, Shield, ShieldAlert, Server, PauseCircle, PlayCircle,
  XCircle, Zap, Eye, Radio, Wrench, Users, Monitor, FileText, Gavel, Sparkles,
  MessageSquareWarning, SlidersHorizontal, Menu, X, LogOut,
} from "lucide-react";
import "./_group.css";

type Icon = typeof Activity;
type MockModule = { key: string; name: string; description: string; href: string; icon: Icon; enabled: boolean; active: boolean; parentEnabled: boolean };

const navigation: Array<{ id: string; label: string; items: Array<{ href: string; icon: Icon; label: string }> }> = [
  { id: "overview", label: "Privire generală", items: [{ href: "/", icon: Activity, label: "Ansamblu" }] },
  { id: "protection", label: "Protecție și detecție", items: [
    { href: "/protectie", icon: Shield, label: "Protecție server" }, { href: "/automod", icon: Bot, label: "AutoMod" },
    { href: "/ai", icon: Sparkles, label: "Moderare AI" }, { href: "/anti-raid", icon: ShieldAlert, label: "Anti-Raid" },
    { href: "/anti-spam", icon: MessageSquareWarning, label: "Anti-Spam" }, { href: "/anti-flood", icon: Activity, label: "Anti-Flood" },
    { href: "/comportament-suspect", icon: Eye, label: "Comportament suspect" },
  ] },
  { id: "moderation", label: "Moderare și evidențe", items: [
    { href: "/politici", icon: BookOpen, label: "Politici generale" }, { href: "/comenzi", icon: Zap, label: "Acțiuni manuale" },
    { href: "/cazuri", icon: ShieldAlert, label: "Cazuri" }, { href: "/audit", icon: History, label: "Loguri și audit" },
  ] },
  { id: "configuration", label: "Configurare", items: [
    { href: "/config", icon: Settings, label: "Configurare module" }, { href: "/config/avansat", icon: SlidersHorizontal, label: "Setări avansate" },
    { href: "/config/unelte", icon: Zap, label: "Unelte staff" }, { href: "/config/cazuri-audit", icon: FileText, label: "Setări cazuri și audit" },
    { href: "/config/escaladare", icon: Gavel, label: "Escaladare" }, { href: "/config/embeduri", icon: Sparkles, label: "Embed-uri" },
  ] },
  { id: "bot-control", label: "Control bot", items: [
    { href: "/canale", icon: Radio, label: "Canale" }, { href: "/provisioning", icon: Wrench, label: "Provisioning" },
    { href: "/bot?tab=roles", icon: Users, label: "Roluri" }, { href: "/bot?tab=tickets", icon: SlidersHorizontal, label: "Tichete" },
    { href: "/verificare", icon: Shield, label: "Verificare" }, { href: "/bot?tab=messages", icon: Activity, label: "Mesaje" },
    { href: "/bot?tab=statistics", icon: Monitor, label: "Statistici" },
  ] },
];

const seedModules: MockModule[] = [
  { key: "autoMod", name: "AutoMod", description: "Filtre clasice și sincronizare Discord AutoMod nativ.", href: "/automod", active: true, enabled: true, parentEnabled: true, icon: Bot },
  { key: "wordFilter", name: "Filtru cuvinte", description: "Cuvinte interzise și acțiunea aplicată la detectare.", href: "/automod", active: true, enabled: true, parentEnabled: true, icon: BookOpen },
  { key: "linkBlock", name: "Blocare linkuri", description: "Linkuri interzise și răspunsul automat asociat.", href: "/automod", active: false, enabled: false, parentEnabled: true, icon: Zap },
  { key: "antiRaid", name: "Anti-Raid", description: "Valuri de intrări și conturi prea noi.", href: "/anti-raid", active: true, enabled: true, parentEnabled: true, icon: ShieldAlert },
  { key: "antiSpam", name: "Anti-Spam", description: "Mesaje, editări, mențiuni și emoji repetitive.", href: "/anti-spam", active: false, enabled: false, parentEnabled: true, icon: Activity },
  { key: "antiFlood", name: "Anti-Flood", description: "Mesaje lungi și șiruri excesive.", href: "/anti-flood", active: false, enabled: false, parentEnabled: true, icon: Activity },
  { key: "suspiciousBehavior", name: "Comportament suspect", description: "Alerte pentru activitate și schimbări neobișnuite.", href: "/comportament-suspect", active: false, enabled: false, parentEnabled: true, icon: ShieldAlert },
  { key: "ai", name: "Moderare AI", description: "Analiză inteligentă separată de AutoMod.", href: "/ai", active: true, enabled: true, parentEnabled: true, icon: Bot },
];

const auditLogs = [
  { id: "1", actor: "Administrator", title: "A actualizat protecția serverului", details: "Modulele principale sunt active.", time: "10:42" },
  { id: "2", actor: "Cronicar", title: "A modificat regulile AutoMod", details: "Filtrul de cuvinte a fost salvat.", time: "10:36" },
  { id: "3", actor: "Moderator", title: "A închis cazul #184", details: "Acțiunea a fost înregistrată.", time: "10:18" },
  { id: "4", actor: "Administrator", title: "A configurat canalul de audit", details: "Canalul consiliului este sincronizat.", time: "09:54" },
  { id: "5", actor: "Sistem", title: "Sincronizare Discord finalizată", details: "Toate permisiunile sunt actualizate.", time: "09:41" },
];

function DashboardOverview() {
  const [gamePaused, setGamePaused] = useState<boolean | null>(false);
  const [protectionEnabled, setProtectionEnabled] = useState(true);
  const [modules, setModules] = useState(seedModules);
  const activeGuild = { name: "Serverul lui LEGION" };
  const toggleModule = (key: string) => setModules((current) => current.map((module) => module.key === key ? { ...module, enabled: !module.enabled, active: !module.enabled && protectionEnabled } : module));
  const visibleConfig = { autoMod: { enabled: modules[0].enabled } };
  const openCases = 3;

  return (
    <div className="space-y-8 pb-10 animate-stagger-1">
      <a href="#" onClick={(event) => event.preventDefault()} className="group flex w-full max-w-sm items-center gap-3 rounded-xl border border-primary/30 bg-gradient-to-br from-primary/10 via-card/80 to-background/80 px-3 py-3 shadow-lg transition-all hover:-translate-y-0.5 hover:border-primary/60 hover:shadow-[0_8px_20px_rgba(214,84,81,0.15)]" title={`Deschide invitația ${activeGuild.name}`} data-testid="link-dashboard-server-invite">
        <span className="relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-primary/40 bg-background/80 text-primary shadow-inner"><div className="absolute inset-0 bg-primary/5 group-hover:bg-primary/10 transition-colors" /><Server className="relative z-10 h-6 w-6" aria-hidden="true" /></span>
        <span className="min-w-0 flex-1"><span className="block font-mono text-[9px] uppercase tracking-[0.16em] text-primary/80">Serverul oficial</span><strong className="block truncate font-display text-lg font-medium text-foreground">{activeGuild.name}</strong><span className="block truncate font-mono text-[10px] tracking-wider text-muted-foreground">discord.gg/oracolul</span></span>
        <ArrowUpRight className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
      </a>
      <header className="flex flex-col gap-5 border-b border-border/60 pb-7 md:flex-row md:items-end md:justify-between animate-stagger-2">
        <div><div className="mod-status-line mb-3">Sesiune autentificată</div><h1 className="mod-heading text-5xl text-foreground sm:text-6xl">{activeGuild.name}</h1><p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">Consola operatorului pentru gestionarea securității. Orice modificare se aplică instantaneu în regat.</p></div>
        <a href="#config" onClick={(event) => event.preventDefault()} data-testid="link-dashboard-settings" className="inline-flex w-fit items-center gap-2 rounded-lg border border-border bg-card/70 px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:border-primary/50 hover:bg-primary/10"><Settings className="h-4 w-4 text-primary" aria-hidden="true" /> Configurare <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" /></a>
      </header>
      <section className={`animate-stagger-3 flex flex-col gap-5 rounded-2xl border p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6 ${gamePaused === true ? "border-destructive/40 bg-destructive/5" : gamePaused === false ? "border-primary/25 bg-primary/5" : "border-amber-500/40 bg-amber-500/5"}`} aria-label="Control stare joc">
        <div className="flex items-start gap-4"><span className={`mt-0.5 rounded-xl p-3 ${gamePaused === true ? "bg-destructive/10 text-destructive" : gamePaused === false ? "bg-primary/10 text-primary" : "bg-amber-500/10 text-amber-600"}`}>{gamePaused === true ? <PlayCircle className="h-5 w-5" aria-hidden="true" /> : gamePaused === false ? <PauseCircle className="h-5 w-5" aria-hidden="true" /> : <AlertTriangle className="h-5 w-5" aria-hidden="true" />}</span><div><p className="mod-eyebrow">{gamePaused === null ? "Stare necunoscută" : gamePaused ? "Joc suspendat" : "Joc activ"}</p><h2 className="mt-1 font-display text-2xl text-foreground">{gamePaused === null ? "Starea jocului nu este confirmată" : gamePaused ? "Activitățile sunt oprite" : "Regatul rulează normal"}</h2><p className="mt-1 max-w-xl text-sm leading-relaxed text-muted-foreground">{gamePaused === null ? "Starea nu este disponibilă momentan; comanda de oprire sau repornire este dezactivată până la confirmarea serverului." : gamePaused ? "Evenimentele, luptele, cuferele și recompensele sunt blocate până la repornire." : "Poți suspenda temporar activitățile jocului fără să oprești moderarea sau Oracle AI."}</p></div></div>
        <button type="button" className="shrink-0 gap-2 rounded-md bg-destructive px-4 py-2 text-sm text-white" onClick={() => setGamePaused((current) => current === null ? false : !current)}>{gamePaused === true ? <PlayCircle className="inline h-4 w-4" aria-hidden="true" /> : <PauseCircle className="inline h-4 w-4" aria-hidden="true" />} {gamePaused ? "Pornește jocul" : "Oprește jocul"}</button>
      </section>
      <section aria-label="Indicatori principali" className="grid gap-4 md:grid-cols-3 animate-stagger-4">
        <div className="mod-card group rounded-2xl p-5 sm:p-6"><div className="flex items-start justify-between"><span className="mod-eyebrow text-muted-foreground">Cazuri deschise</span><span className="rounded-lg bg-destructive/10 p-2.5 text-destructive"><AlertTriangle className="h-4 w-4" aria-hidden="true" /></span></div><div className="mt-7 flex items-end justify-between gap-3"><strong className="font-display text-5xl font-semibold text-foreground">{openCases}</strong><span className="mb-1 flex items-center gap-1 text-xs text-muted-foreground"><Clock className="h-3.5 w-3.5" aria-hidden="true" /> revizuire</span></div><div className="mt-5 h-1 overflow-hidden rounded-full bg-secondary"><div className="h-full w-2/3 rounded-full bg-destructive" /></div></div>
        <div className="mod-card group rounded-2xl p-5 sm:p-6"><div className="flex items-start justify-between"><span className="mod-eyebrow text-muted-foreground">Scut AutoMod</span><span className="rounded-lg bg-primary/10 p-2.5 text-primary"><Shield className="h-4 w-4" aria-hidden="true" /></span></div><div className="mt-7 flex items-end justify-between gap-3"><strong className="font-display text-4xl font-semibold text-foreground">{protectionEnabled && visibleConfig.autoMod.enabled ? "Activ" : "Oprit"}</strong><span className="mb-1 text-xs text-muted-foreground">monitorizare live</span></div><div className="mt-5 flex items-center gap-2 text-xs text-muted-foreground"><span className="h-1.5 w-1.5 rounded-full bg-primary" /> reguli clasice</div></div>
        <div className="mod-card group rounded-2xl p-5 sm:p-6"><div className="flex items-start justify-between"><span className="mod-eyebrow text-muted-foreground">Loguri audit azi</span><span className="rounded-lg bg-secondary p-2.5 text-primary"><Activity className="h-4 w-4" aria-hidden="true" /></span></div><div className="mt-7 flex items-end justify-between gap-3"><strong className="font-display text-5xl font-semibold text-foreground">{auditLogs.length}</strong><span className="mb-1 text-xs text-muted-foreground">evenimente</span></div><div className="mt-5 flex h-1 items-end gap-1" aria-hidden="true">{[35,58,42,76,48,86,63,72,54,92,68,80].map((height) => <span key={height} className="flex-1 rounded-full bg-primary/60" style={{ height: `${height}%` }} />)}</div></div>
      </section>
      <div data-testid="dashboard-columns" className="grid gap-6 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] animate-stagger-5">
        <section className="min-w-0 space-y-4"><div className="flex flex-wrap items-end justify-between gap-3 border-b border-border/60 pb-3"><div><p className="mod-eyebrow">Sisteme</p><h2 className="mod-heading mt-1 text-2xl">Module de Protecție</h2></div><div className="flex items-center gap-3"><label className="flex items-center gap-2 text-xs font-medium text-muted-foreground"><span>{protectionEnabled ? "ACTIVĂ" : "OPRITĂ"}</span><button className="rounded-full bg-primary px-2 py-1 text-[9px] text-white" onClick={() => setProtectionEnabled((value) => !value)}>{protectionEnabled ? "ON" : "OFF"}</button></label><a href="#" onClick={(event) => event.preventDefault()} className="inline-flex items-center gap-1 text-xs font-mono tracking-widest text-primary">GESTIONEAZĂ <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" /></a></div></div><div className="grid gap-3 2xl:grid-cols-2">{modules.map((mod) => <article key={mod.key} className="mod-card mod-card-interactive flex min-w-0 items-start gap-3 p-4" data-testid={`card-module-${mod.key}`}><div className={`shrink-0 rounded-lg border p-2.5 ${mod.active ? "border-primary/30 bg-primary/10 text-primary" : "border-transparent bg-secondary text-muted-foreground"}`}><mod.icon className="h-4 w-4" aria-hidden="true" /></div><a href={mod.href} onClick={(event) => event.preventDefault()} className="min-w-0 flex-1 rounded-md" data-testid={`link-module-${mod.key}`}><h3 className="flex items-center gap-1 text-sm font-medium leading-snug text-foreground">{mod.name}<ChevronRight className="h-3.5 w-3.5 shrink-0 text-primary/70" aria-hidden="true" /></h3><p className="mt-1 text-xs leading-relaxed text-muted-foreground">{mod.description}</p><p className={`mt-2 flex items-center gap-1 font-mono text-[10px] tracking-wider ${mod.active ? "text-primary" : mod.enabled ? "text-amber-500" : "text-muted-foreground"}`}>{mod.active ? <CheckCircle2 className="h-3 w-3 shrink-0" aria-hidden="true" /> : mod.enabled ? <PauseCircle className="h-3 w-3 shrink-0" aria-hidden="true" /> : <XCircle className="h-3 w-3 shrink-0" aria-hidden="true" />}{mod.active ? "ACTIV" : mod.enabled && !protectionEnabled ? "CONFIGURAT · PROTECȚIA GLOBALĂ OPRITĂ" : mod.enabled && !mod.parentEnabled ? "CONFIGURAT · AUTOMOD OPRIT" : "INACTIV"}</p></a><div className="pt-1"><button className={`h-5 w-9 rounded-full ${mod.enabled ? "bg-primary" : "bg-secondary"}`} onClick={() => toggleModule(mod.key)} aria-label={`${mod.enabled ? "Dezactivează" : "Activează"} ${mod.name}`}><span className={`mx-0.5 block h-4 w-4 rounded-full bg-foreground transition-transform ${mod.enabled ? "translate-x-4" : ""}`} /></button></div></article>)}</div></section>
        <section className="min-w-0 space-y-4"><div className="flex items-end justify-between border-b border-border/60 pb-3"><div><p className="mod-eyebrow">Jurnal</p><h2 className="mod-heading mt-1 text-2xl">Activitate Recentă</h2></div><a href="#" onClick={(event) => event.preventDefault()} className="inline-flex items-center gap-1 text-xs font-mono tracking-widest text-primary">VEZI TOT <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" /></a></div><div className="mod-card overflow-hidden p-1.5 shadow-lg shadow-black/40"><div className="divide-y divide-border/40">{auditLogs.map((log, index) => <div key={log.id} className="group flex gap-3 rounded-xl p-3.5 transition-colors hover:bg-secondary/45" data-testid={`row-dashboard-audit-${index}`}><div className="mt-2 h-2 w-2 shrink-0 rounded-full bg-primary ring-4 ring-primary/10" /><div className="min-w-0 flex-1"><p className="truncate text-sm"><strong className="font-medium text-foreground">{log.actor}</strong><span className="mx-1 text-muted-foreground">·</span><span className="text-primary">{log.title}</span></p><p className="mt-1 truncate text-xs text-muted-foreground">{log.details}</p></div><time className="shrink-0 font-mono text-[10px] text-muted-foreground">{log.time}</time></div>)}</div></div></section>
      </div>
    </div>
  );
}

export function Current() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [active, setActive] = useState("/");
  return <div className="status-current"><div className="mod-shell dark">
    {mobileMenuOpen && <div className="fixed inset-0 z-40 bg-background/80 md:hidden" onClick={() => setMobileMenuOpen(false)} />}
    <aside aria-label="Navigare moderare" className={`mod-sidebar fixed inset-y-0 left-0 z-50 flex w-72 flex-col transition-transform md:sticky md:translate-x-0 ${mobileMenuOpen ? "translate-x-0" : "-translate-x-full"}`}>
      <div className="fire-toolbar mod-toolbar flex h-20 shrink-0 items-center justify-between border-b border-border/50 px-5"><div className="flex items-center gap-3 text-primary"><div className="mod-brand-mark"><Eye className="h-5 w-5" aria-hidden="true" /></div><div className="flex flex-col"><span className="font-display text-xl font-semibold leading-none tracking-wide text-foreground">ORACOLUL</span><span className="mt-1 font-mono text-[10px] tracking-widest">BOT / CONSOLĂ</span></div></div><button className="p-2 md:hidden" onClick={() => setMobileMenuOpen(false)} aria-label="Închide meniul"><X className="h-5 w-5" /></button></div>
      <div className="flex-1 overflow-y-auto py-6"><div className="px-6 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Server Curent</div><div className="px-6"><select className="mt-3 w-full rounded-md border border-border bg-background/70 px-3 py-2 text-sm text-foreground"><option>Serverul lui LEGION</option></select></div><div className="px-4"><div className="mt-7 px-2 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Instrumente</div><nav className="mt-2 space-y-3">{navigation.map((group) => <section key={group.id}><h3 className="px-3 py-2 text-[11px] font-mono uppercase tracking-[0.14em] text-muted-foreground">{group.label} <span className="opacity-70">{String(group.items.length).padStart(2, "0")}</span></h3><div className="flex flex-col gap-1">{group.items.map((item) => <a key={item.href} href="#" onClick={(event) => { event.preventDefault(); setActive(item.href); }} className={`mod-sidebar-item flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium ${active === item.href ? "text-primary" : "text-muted-foreground"}`} data-active={active === item.href}><item.icon className="h-4 w-4 shrink-0" aria-hidden="true" /><span>{item.label}</span></a>)}</div></section>)}</nav></div></div>
      <div className="border-t border-border/50 p-4"><div className="flex items-center gap-2 text-xs"><Server className="h-4 w-4 text-primary" /><span className="truncate">Serverul lui LEGION</span><LogOut className="ml-auto h-4 w-4 text-destructive" /></div></div>
    </aside>
    <main className="flex min-h-screen min-w-0 flex-1 flex-col bg-background"><header className="fire-toolbar mod-toolbar flex h-16 items-center justify-between border-b border-border/50 px-4 md:hidden"><span className="font-display text-lg font-semibold">ORACOLUL</span><button onClick={() => setMobileMenuOpen(true)} aria-label="Deschide meniul"><Menu /></button></header><div className="mod-page min-h-0 flex-1 overflow-x-hidden overflow-y-auto p-4 sm:p-6 md:p-8"><div className="mx-auto w-full max-w-5xl"><DashboardOverview /></div></div></main>
  </div></div>;
}