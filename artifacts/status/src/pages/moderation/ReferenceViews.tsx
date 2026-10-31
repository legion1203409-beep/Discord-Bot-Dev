import { useState, type CSSProperties, type ReactNode } from "react";
import {
  Activity, AlertTriangle, ArrowUpRight, Bot, BookOpen, Check,
  ChevronRight, CircleHelp, FileText, Gavel, History, Home, LockKeyhole,
  MessageCircle, Radio, RefreshCw, Server, Shield, ShieldAlert, Sparkles, Ticket,
  Trophy, Users, Wrench,
} from "lucide-react";
import { Link, useParams } from "wouter";
import { Button } from "@workspace/oracolul-cenusii-ds/components/ui/button";
import { Switch } from "@workspace/oracolul-cenusii-ds/components/ui/switch";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "../../components/ui/dialog";
import { CommandsPage } from "./Commands";
import { CasesPage } from "./Cases";
import { AuditPage } from "./Audit";
import { CategorySettingsPage } from "./CategorySettings";
import { BotControlPage } from "./BotControl";
import { VerificationAdminPage } from "./VerificationAdmin";
import {
  useActiveGuild, useAuditLogs, useBotControl, useCases, useGameplayState,
  useModerationConfig, type BotControlConfig,
} from "../../hooks/use-moderation-api";
import { presentAuditActor, presentAuditLog } from "../../lib/moderation-audit";
import { OfflineAssistant } from "./OfflineAssistant";
import "./reference-views.css";

type ToggleKey =
  | "protection" | "autoMod" | "wordFilter" | "linkBlock" | "antiRaid"
  | "antiSpam" | "antiFlood" | "suspiciousBehavior" | "ai" | "manualTools"
  | "cases" | "audit" | "escalation" | "embeds";

type Feature = {
  id: string;
  title: string;
  description: string;
  path?: string[];
  toggle?: ToggleKey;
  editor?: string;
  children?: string[];
  readOnly?: string;
};

type ViewDefinition = {
  id: string;
  title: string;
  description: string;
  icon: typeof Home;
  features: Feature[];
  editorLabel: string;
};

const definitions: Record<string, ViewDefinition> = {
  protectie: {
    id: "protectie",
    title: "Protecție",
    description: "Filtrele care țin serverul curat: AutoMod, anti-spam, anti-flood, anti-raid și urmărirea comportamentului suspect.",
    icon: Shield,
    editorLabel: "Deschide editorul de protecție",
    features: [
      { id: "automod", title: "AutoMod pentru mesaje", description: "Filtrează mesaje, cuvinte și linkuri folosind configurația serverului.", path: ["autoMod", "enabled"], toggle: "autoMod", editor: "/automod", children: ["Filtru de cuvinte", "Blocare linkuri", "Reguli AutoMod Discord"] },
      { id: "antispam", title: "Anti-spam", description: "Limite și acțiuni pentru mesaje repetitive, mențiuni și emoji.", path: ["antiSpam", "enabled"], toggle: "antiSpam", editor: "/anti-spam", children: ["Mențiuni", "Emoji", "Mesaje lungi", "Majuscule și repetiții"] },
      { id: "antiflood", title: "Anti-flood", description: "Protecție la rafale de mesaje, editări și ștergeri.", path: ["antiFlood", "enabled"], toggle: "antiFlood", editor: "/anti-flood", children: ["Mesaje rapide", "Editări repetate", "Ștergeri repetate"] },
      { id: "antiraid", title: "Anti-raid", description: "Detectează valurile de membri noi și aplică reacțiile configurate.", path: ["antiRaid", "enabled"], toggle: "antiRaid", editor: "/anti-raid", children: ["Pragul de intrări", "Vârsta conturilor", "Blocare automată"] },
      { id: "suspect", title: "Comportament suspect", description: "Alerte pentru activitate neobișnuită, conform configurației curente.", path: ["suspiciousBehavior", "enabled"], toggle: "suspiciousBehavior", editor: "/comportament-suspect", children: ["Schimbări de rol", "Activitate în masă", "Alerte staff"] },
    ],
  },
  judecator: {
    id: "judecator",
    title: "Oracolul Judecător",
    description: "Moderarea cu AI: configurația și criteriile disponibile pentru serverul selectat.",
    icon: Gavel,
    editorLabel: "Deschide setările AI",
    features: [
      { id: "ai", title: "Moderare AI", description: "Analiză inteligentă separată de AutoMod, controlată per server.", path: ["ai", "enabled"], toggle: "ai", editor: "/ai", children: ["Toxicitate și vulgarități", "Atacuri și bullying", "Spam inteligent și trolling", "Scamuri", "Amenințări", "Linkuri înșelătoare"] },
    ],
  },
  sanctiuni: {
    id: "sanctiuni",
    title: "Sancțiuni",
    description: "Unelte staff și escaladarea sancțiunilor disponibile pentru serverul selectat.",
    icon: Gavel,
    editorLabel: "Deschide configurarea sancțiunilor",
    features: [
      { id: "escalation", title: "Escaladarea sancțiunilor", description: "Starea configurației sancțiunilor progresive pentru abateri repetate.", path: ["escalation", "enabled"], toggle: "escalation", editor: "/config/escaladare", children: ["Niveluri de sancțiune", "Resetarea abaterilor"] },
      { id: "manual", title: "Comenzi de moderare", description: "Execută avertisment, mute, kick, ban și celelalte acțiuni expuse de API.", path: ["manualTools", "enabled"], toggle: "manualTools", editor: "/comenzi", children: ["Acțiuni disponibile", "Acces staff", "Înregistrare în cazuri"] },
    ],
  },
  dosare: {
    id: "dosare",
    title: "Dosare și jurnale",
    description: "Dosarele de moderare și evenimentele de audit reale ale serverului.",
    icon: BookOpen,
    editorLabel: "Deschide dosarele și jurnalele",
    features: [
      { id: "cases", title: "Dosare de moderare", description: "Cazuri persistate pe server, cu stare, note și detalii.", path: ["cases", "enabled"], toggle: "cases", editor: "/cazuri", children: ["Cazuri deschise", "Istoric", "Note staff"] },
      { id: "audit", title: "Audit", description: "Jurnalul de audit al acțiunilor și schimbărilor.", path: ["audit", "enabled"], toggle: "audit", editor: "/audit", children: ["Evenimente", "Filtrare și perioadă"] },
      { id: "activity-log", title: "Jurnale de activitate", description: "Starea jurnalizării și categoriile configurate în setările serverului.", path: ["activityLog", "enabled"], editor: "/config/cazuri-audit", children: ["Categorii de evenimente", "Canale de jurnal"], readOnly: "Configurarea jurnalelor nu are o acțiune de activare rapidă aici; folosește editorul dedicat." },
    ],
  },
  tichete: {
    id: "tichete",
    title: "Verificare și tichete",
    description: "Fluxurile de verificare și tichete configurate efectiv în Control Bot pentru serverul selectat.",
    icon: Ticket,
    editorLabel: "Deschide configurarea tichetelor",
    features: [
      { id: "verification", title: "Verificarea membrilor", description: "Panoul de verificare și rolul oferit membrilor noi.", editor: "/verificare", children: ["Canal și rol", "Mesajul panoului", "Publicare în Discord"], readOnly: "Starea publicării și activarea se gestionează în editorul de verificare; nu există un comutator rapid sigur." },
      { id: "staff", title: "Aplicații de staff", description: "Fluxul de solicitări pentru roluri staff.", editor: "/bot?tab=tickets", children: ["Categorie Discord", "Întrebări", "Mesaje către membru și staff"] },
      { id: "partnership", title: "Parteneriate", description: "Fluxul de cereri de parteneriat al serverului.", editor: "/bot?tab=tickets", children: ["Categorie Discord", "Formular", "Anunțuri"] },
      { id: "help_report", title: "Ajutor și raportări", description: "Flux pentru cereri de ajutor și raportări.", editor: "/bot?tab=tickets", children: ["Categorie Discord", "Formular", "Acțiune la finalizare"] },
      { id: "appeal", title: "Contestații", description: "Flux pentru contestarea unei sancțiuni.", editor: "/bot?tab=tickets", children: ["Categorie Discord", "Legare la caz", "Acțiune la finalizare"] },
    ],
  },
  rpg: {
    id: "rpg",
    title: "Jocul RPG",
    description: "Starea reală a jocului și configurația de gameplay returnată pentru serverul selectat.",
    icon: Trophy,
    editorLabel: "Deschide setările Discord ale jocului",
    features: [
      { id: "game-state", title: "Starea jocului", description: "Control server-side pentru pauza activităților de gameplay.", children: ["Oprire și repornire", "Confirmarea stării API"] },
      { id: "heroes", title: "Profiluri și eroi", description: "Controalele pentru clase și profiluri nu sunt expuse de API-ul disponibil.", readOnly: "Read-only: nu există un endpoint sau câmp guild-scoped pentru gestionarea claselor/profilurilor." },
      { id: "experience", title: "Niveluri și experiență", description: "Valorile de progres disponibile în API sunt afișate fără a pretinde suport de editare.", children: ["Multiplicatori XP pentru monștri și boss"] },
      { id: "economy", title: "Oboli și magazin", description: "Economia are doar multiplicatorii expuși în configurația de gameplay.", children: ["Aur pentru monștri", "Aur pentru boss"] },
      { id: "missions", title: "Misiuni, cufăr și relicve", description: "Țintele și recompensele misiunilor returnate de server.", children: ["Ucide 10 monștri", "Găsește 3 obiecte rare", "Învinge un boss"] },
      { id: "battles", title: "Lupte și boss", description: "Intervalele și duratele evenimentelor configurate în API.", children: ["Durata evenimentelor", "Intervalul boss-ului", "Intervalul cuferelor"] },
      { id: "rankings", title: "Clasamente RPG", description: "Clasamentele RPG nu sunt expuse de API-ul guild-scoped disponibil.", readOnly: "Read-only: API-ul disponibil nu oferă starea sau controalele clasamentelor RPG." },
    ],
  },
  oracol: {
    id: "oracol",
    title: "Oracolul",
    description: "Funcțiile conversaționale, profețiile și activitățile comunitare din referință.",
    icon: MessageCircle,
    editorLabel: "Setări conexe disponibile",
    features: [
      { id: "conversation", title: "Oracolul conversațional", description: "Nu există o configurație de conversație expusă în API-ul moderation/control bot curent.", readOnly: "Indisponibil: fără endpoint sau câmp de configurare pentru conversațiile botului." },
      { id: "prophecies", title: "Profeții", description: "Nu există o configurație de profeții expusă pentru acest server.", readOnly: "Indisponibil: fără endpoint sau câmp de configurare pentru profeții." },
      { id: "community", title: "Activități comunitare", description: "Nu există o configurație de activități comunitare expusă pentru acest server.", readOnly: "Indisponibil: fără endpoint sau câmp de configurare pentru activități." },
    ],
  },
  setari: {
    id: "setari",
    title: "Setări bot",
    description: "Modulele de configurare cunoscute din API-ul curent, cu stare live pentru serverul selectat.",
    icon: Wrench,
    editorLabel: "Deschide editorul complet",
    features: [
      { id: "autoMod", title: "AutoMod", description: "Filtre și reguli native Discord.", path: ["autoMod", "enabled"], toggle: "autoMod", editor: "/automod" },
      { id: "ai", title: "Moderare AI", description: "Analiza automată a mesajelor.", path: ["ai", "enabled"], toggle: "ai", editor: "/ai" },
      { id: "manualTools", title: "Unelte staff", description: "Comenzi și intervenții manuale.", path: ["manualTools", "enabled"], toggle: "manualTools", editor: "/config/unelte" },
      { id: "cases", title: "Cazuri și audit", description: "Păstrarea cazurilor și jurnalul de audit.", path: ["cases", "enabled"], toggle: "cases", editor: "/config/cazuri-audit" },
      { id: "escalation", title: "Escaladare", description: "Sancțiuni progresive.", path: ["escalation", "enabled"], toggle: "escalation", editor: "/config/escaladare" },
      { id: "embeds", title: "Embed-uri", description: "Aspectul mesajelor moderation.", path: ["embeds", "enabled"], toggle: "embeds", editor: "/config/embeduri" },
      { id: "channels", title: "Canale și destinații", description: "Destinații și permisiuni Discord.", editor: "/canale", readOnly: "Editorul dedicat gestionează această configurație; nu există un comutator rapid." },
    ],
  },
};

const viewLinks = [
  { id: "protectie", title: "Protecție", href: "/panou/protectie", icon: Shield, keys: ["protection", "autoMod", "antiSpam", "antiFlood", "antiRaid", "suspiciousBehavior"] },
  { id: "judecator", title: "Oracolul Judecător", href: "/panou/judecator", icon: Gavel, keys: ["ai"] },
  { id: "sanctiuni", title: "Sancțiuni", href: "/panou/sanctiuni", icon: ShieldAlert, keys: ["manualTools", "escalation"] },
  { id: "dosare", title: "Dosare și jurnale", href: "/panou/dosare", icon: History, keys: ["cases", "audit"] },
  { id: "tichete", title: "Verificare și tichete", href: "/panou/tichete", icon: Ticket, keys: [] },
  { id: "rpg", title: "Jocul RPG", href: "/panou/rpg", icon: Trophy, keys: [] },
  { id: "oracol", title: "Oracolul", href: "/panou/oracol", icon: MessageCircle, keys: [] },
  { id: "setari", title: "Setări bot", href: "/panou/setari", icon: Wrench, keys: ["embeds"] },
];

function readPath(source: unknown, path: string[]) {
  let value: unknown = source;
  for (const part of path) {
    if (!value || typeof value !== "object") return undefined;
    value = (value as Record<string, unknown>)[part];
  }
  return value;
}

function errorText(error: unknown) {
  return error instanceof Error ? error.message : "Nu am putut încărca datele serverului.";
}

function SkeletonCards({ count = 4 }: { count?: number }) {
  return <div className="ref-module-skeletons" aria-label="Se încarcă datele serverului">
    {Array.from({ length: count }, (_, index) => <div className="ref-skeleton-card" key={index}><i /><i /><i /></div>)}
  </div>;
}

function OverviewView() {
  const { guildId, guilds } = useActiveGuild();
  const { data: config, loading, error, refetch } = useModerationConfig(guildId);
  const { data: cases, loading: casesLoading, error: casesError, refetch: refetchCases } = useCases(guildId, { limit: 10 });
  const { data: logs, loading: logsLoading, error: logsError, refetch: refetchLogs } = useAuditLogs(guildId, { limit: 8 });
  const currentGuild = guilds.find((guild) => guild.id === guildId);
  const checks = [
    "protection", "autoMod", "antiRaid", "antiSpam", "antiFlood", "suspiciousBehavior",
    "ai", "manualTools", "cases", "audit", "escalation", "embeds",
  ];
  const enabled = checks.filter((key) => readPath(config, [key, "enabled"]) === true).length;
  const openCases = cases.filter((item) => item.status === "open").length;

  return <div className="ref-overview">
    <section className="ref-overview-hero">
      <div className="ref-overview-copy">
        <p className="ref-eyebrow"><span className="ref-live-dot" /> {loading ? "Se încarcă serverul" : "Server selectat"} · {currentGuild?.name || "Alege un server"}</p>
        <h1>Panoul<br />Oracolului</h1>
        <p>Pornește, oprește și reglează modulele disponibile pentru serverul selectat. Setările operaționale rămân server-side și folosesc API-urile autentificate ale panoului.</p>
        <div className="ref-overview-meter">
          <div className="ref-meter" role="img" aria-label={`${enabled} din ${checks.length} module configurate ca pornite`} style={{ "--ref-progress": `${checks.length ? (enabled / checks.length) * 100 : 0}%` } as CSSProperties}>
            <div><strong>{loading ? "—" : enabled}</strong><small>din {checks.length}<br />pornite</small></div>
          </div>
          <div className="ref-overview-chips">
            {viewLinks.map((item) => <Link key={item.id} href={item.href} className="ref-overview-chip"><item.icon aria-hidden="true" /><span>{item.title}</span></Link>)}
          </div>
        </div>
      </div>
      <div className="ref-overview-mark" aria-hidden="true"><span className="ref-mark-ring" /><span className="ref-mark-core"><EyeMark /></span></div>
    </section>

    {error && <div className="ref-error" role="alert"><span>{errorText(error)}</span><Button variant="outline" size="sm" onClick={() => void refetch()}><RefreshCw aria-hidden="true" /> Reîncearcă</Button></div>}
    {loading ? <SkeletonCards count={6} /> : config ? <section className="ref-overview-grid" aria-label="Module pe categorii">
      {viewLinks.map((group, index) => {
        const total = group.keys.length;
        const count = group.keys.filter((key) => readPath(config, [key, "enabled"]) === true).length;
        const Icon = group.icon;
        const groupItems = definitions[group.id]?.features ?? [];
        return <article className="ref-overview-card" key={group.id} style={{ "--ref-index": index } as CSSProperties}>
          <header><span className="ref-group-icon"><Icon aria-hidden="true" /></span><div><h2>{group.title}</h2><p>{total ? `${count} din ${total} module pornite` : "Stare disponibilă în editorul dedicat"}</p></div><Link href={group.href} aria-label={`Deschide ${group.title}`}><ArrowUpRight aria-hidden="true" /></Link></header>
          {total > 0 && <div className="ref-progress"><i style={{ width: `${(count / total) * 100}%` }} /></div>}
          <ul>{groupItems.map((feature) => {
            const status = feature.path ? readPath(config, feature.path) : undefined;
            return <li key={feature.id}><Link href={feature.editor || group.href}><span>{feature.title}</span><small>{typeof status === "boolean" ? status ? "Pornit" : "Oprit" : "Detalii"}</small></Link></li>;
          })}</ul>
        </article>;
      })}
      <article className="ref-overview-card ref-overview-card--facts">
        <header><span className="ref-group-icon"><Server aria-hidden="true" /></span><div><h2>Serverul selectat</h2><p>Doar date confirmate de API</p></div></header>
        <dl><div><dt>Cazuri deschise</dt><dd>{casesLoading ? "…" : casesError ? "Eroare" : openCases}</dd></div><div><dt>Evenimente de audit returnate</dt><dd>{logsLoading ? "…" : logsError ? "Eroare" : logs.length}</dd></div><div><dt>Identificator</dt><dd className="ref-id">{guildId || "—"}</dd></div></dl>
        {casesError && <p className="ref-muted" role="alert">Dosarele nu s-au putut încărca. <Button variant="link" size="sm" className="ref-inline-retry" onClick={() => void refetchCases()}>Reîncearcă</Button></p>}
        {!casesLoading && !casesError && !openCases && <p className="ref-muted">Nu există cazuri deschise returnate de API pentru serverul selectat.</p>}
        {logsError && <p className="ref-muted" role="alert">Auditul nu s-a putut încărca. <Button variant="link" size="sm" className="ref-inline-retry" onClick={() => void refetchLogs()}>Reîncearcă</Button></p>}
        {!logsLoading && !logsError && logs.length === 0 && <p className="ref-muted">Nu există evenimente returnate în această citire. Istoricul complet este disponibil în pagina Audit.</p>}
      </article>
      <article className="ref-overview-card ref-overview-card--log">
        <header><span className="ref-group-icon"><History aria-hidden="true" /></span><div><h2>Ultimele evenimente</h2><p>Jurnal live al serverului · nu date demonstrative</p></div><Button variant="ghost" size="icon" aria-label="Reîncarcă evenimentele" onClick={() => { void refetchCases(); void refetchLogs(); }} disabled={casesLoading || logsLoading}><RefreshCw aria-hidden="true" /></Button></header>
        {casesLoading || logsLoading ? <div className="ref-log-loading"><i /><i /><i /></div> : logsError ? <div className="ref-error" role="alert"><span>{logsError.message}</span><Button variant="outline" size="sm" onClick={() => void refetchLogs()}>Reîncearcă auditul</Button></div> : logs.length > 0 ? <ol>{logs.slice(0, 6).map((log) => {
          const presentation = presentAuditLog(log);
          return <li key={log.id}><span className="ref-log-dot" /><div><b>{presentation.title}</b><small>{presentAuditActor(log)} · {presentation.details}</small></div><time>{new Date(log.createdAt).toLocaleString("ro-RO")}</time></li>;
        })}</ol> : <div className="ref-empty-state"><History aria-hidden="true" /><p>Nicio intrare returnată în această citire.</p><Link href="/audit">Deschide jurnalul complet <ChevronRight aria-hidden="true" /></Link></div>}
        <Link className="ref-card-link" href="/audit">Deschide auditul complet <ChevronRight aria-hidden="true" /></Link>
      </article>
    </section> : !error ? <div className="ref-error" role="status">Alege un server autorizat pentru a încărca modulele.</div> : null}
  </div>;
}

function EyeMark() {
  return <svg viewBox="0 0 100 100" role="img" aria-label="Simbolul Oracolului"><circle cx="50" cy="50" r="44" /><path d="M19 50c14-20 48-20 62 0-14 20-48 20-62 0Z" /><circle cx="50" cy="50" r="14" /><path d="M50 39c5 7 5 15 0 22-5-7-5-15 0-22Z" /></svg>;
}

function ModuleStatus({ feature, config }: { feature: Feature; config: unknown }) {
  if (feature.readOnly && !feature.path) return <span className="ref-status ref-status--unknown"><CircleHelp aria-hidden="true" /> Read-only</span>;
  if (!feature.path) return <span className="ref-status ref-status--unknown"><CircleHelp aria-hidden="true" /> API fără stare</span>;
  const value = readPath(config, feature.path);
  if (typeof value !== "boolean") return <span className="ref-status ref-status--unknown"><CircleHelp aria-hidden="true" /> Stare necunoscută</span>;
  return <span className={`ref-status ${value ? "ref-status--on" : "ref-status--off"}`}><i />{value ? "Pornit" : "Oprit"}</span>;
}

function GroupPage({ view }: { view: string }) {
  const definition = definitions[view];
  const { guildId, guilds } = useActiveGuild();
  const { data: config, loading, error, refetch, updateProtectionToggle } = useModerationConfig(guildId);
  const [selectedId, setSelectedId] = useState(definition?.features[0]?.id ?? "");
  const [saving, setSaving] = useState<string | null>(null);
  const [actionError, setActionError] = useState("");
  const [globalProtectionBusy, setGlobalProtectionBusy] = useState(false);
  const [globalError, setGlobalError] = useState("");
  const currentGuild = guilds.find((guild) => guild.id === guildId);
  const selected = definition?.features.find((feature) => feature.id === selectedId) ?? definition?.features[0];
  const enabledCount = definition?.features.filter((feature) => feature.path && readPath(config, feature.path) === true).length ?? 0;
  const knownStates = definition?.features.filter((feature) => feature.path).length ?? 0;
  const toggles = definition?.features.filter((feature) => feature.toggle).length ?? 0;

  if (!definition) return <div className="ref-error" role="alert">Această vedere nu există. Folosește căutarea pentru a deschide o pagină disponibilă.</div>;

  const setModule = async (feature: Feature, enabled: boolean) => {
    if (!feature.toggle || !guildId) return;
    setSaving(feature.id);
    setActionError("");
    try { await updateProtectionToggle(feature.toggle, enabled); }
    catch (cause) { setActionError(errorText(cause)); }
    finally { setSaving(null); }
  };
  const setGlobalProtection = async (enabled: boolean) => {
    if (!guildId) return;
    setGlobalProtectionBusy(true);
    setGlobalError("");
    try { await updateProtectionToggle("protection", enabled); }
    catch (cause) { setGlobalError(errorText(cause)); }
    finally { setGlobalProtectionBusy(false); }
  };

  return <div className="ref-group-view">
    <header className="ref-group-head">
      <div>
        <p className="ref-eyebrow"><span className="ref-live-dot" /> {currentGuild?.name || "Server neselectat"}</p>
        <h1>{definition.title}</h1>
        <p>{definition.description}</p>
      </div>
      <div className="ref-group-counter"><strong>{loading ? "—" : knownStates ? `${enabledCount}/${knownStates}` : "API"}</strong><span>{knownStates ? <>module<br />pornite</> : <>stare<br />live</>}</span><i style={{ "--ref-progress": `${knownStates ? (enabledCount / knownStates) * 100 : 0}%` } as CSSProperties} /></div>
    </header>

    {view === "protectie" && <section className="ref-master-toggle" aria-label="Protecție globală">
      <span className="ref-master-icon"><Shield aria-hidden="true" /></span>
      <div><p className="ref-eyebrow">Protecție globală</p><h2>Control pentru modulele automate</h2><p>Starea modulelor se păstrează; dezactivarea globală suspendă protecția fără a rescrie setările individuale.</p></div>
      <Switch checked={readPath(config, ["protection", "enabled"]) === true} disabled={loading || globalProtectionBusy || !config} onCheckedChange={(enabled) => void setGlobalProtection(enabled)} aria-label="Activează protecția globală" />
      {globalError && <p className="ref-inline-error" role="alert">{globalError}</p>}
    </section>}

    {loading && view !== "rpg" && view !== "tichete" ? <SkeletonCards count={4} /> : error && view !== "rpg" && view !== "tichete" ? <div className="ref-error" role="alert"><span>{error.message}</span><Button variant="outline" size="sm" onClick={() => void refetch()}><RefreshCw aria-hidden="true" /> Reîncearcă</Button></div> : <>
      {error && (view === "rpg" || view === "tichete") && <div className="ref-error" role="status"><span>Configurația de moderare nu este disponibilă; datele specifice acestui modul sunt citite separat.</span><Button variant="outline" size="sm" onClick={() => void refetch()}><RefreshCw aria-hidden="true" /> Reîncearcă</Button></div>}
      <div className="ref-group-layout">
        <nav className="ref-module-nav" aria-label={`Modulele din ${definition.title}`}>
          <div className="ref-module-nav-head"><b>Module</b><span>{definition.features.length.toString().padStart(2, "0")}</span></div>
          {definition.features.map((feature) => <Button key={feature.id} type="button" variant="ghost" size="sm" className={`ref-module-nav-item ${feature.id === selected?.id ? "is-selected" : ""}`} aria-current={feature.id === selected?.id ? "true" : undefined} onClick={() => setSelectedId(feature.id)}>
            <span className="ref-module-nav-icon"><ModuleIcon id={feature.id} /></span>
            <span><b>{feature.title}</b><small><ModuleStatus feature={feature} config={config} /></small></span>
            <ChevronRight aria-hidden="true" />
          </Button>)}
        </nav>

        {selected && <section className="ref-module-detail" aria-labelledby={`ref-title-${selected.id}`}>
          <header className="ref-module-heading">
            <span className="ref-module-heading-icon"><ModuleIcon id={selected.id} /></span>
            <div><p className="ref-eyebrow">{definition.title} · {currentGuild?.name || "Server"}</p><h2 id={`ref-title-${selected.id}`}>{selected.title}</h2><p>{selected.description}</p></div>
            {selected.toggle && <div className="ref-module-toggle"><span>{readPath(config, selected.path || []) === true ? "Pornit" : "Oprit"}</span><Switch checked={readPath(config, selected.path || []) === true} disabled={loading || saving === selected.id || !config} onCheckedChange={(enabled) => void setModule(selected, enabled)} aria-label={`${readPath(config, selected.path || []) === true ? "Oprește" : "Pornește"} ${selected.title}`} /></div>}
          </header>
          {actionError && <div className="ref-error" role="alert"><span>{actionError}</span><Button variant="outline" size="sm" onClick={() => void refetch()}>Reîncarcă starea</Button></div>}
          {!selected.toggle && selected.readOnly && <div className="ref-readonly"><LockKeyhole aria-hidden="true" /><p>{selected.readOnly}</p></div>}
          {selected.children && <section className="ref-feature-sections" aria-label={`Funcții și setări ${selected.title}`}>
            <h3>În acest modul</h3>
            <div className="ref-feature-grid">{selected.children.map((child) => <div className="ref-feature-row" key={child}><Check aria-hidden="true" /><span>{child}</span></div>)}</div>
            {selected.id === "automod" && <div className="ref-submodule-state">
              <p><span>Filtru de cuvinte</span><ModuleStatus feature={{ id: "wordFilter", title: "Filtru de cuvinte", description: "", path: ["autoMod", "wordFilter", "enabled"] }} config={config} /></p>
              <p><span>Blocare linkuri</span><ModuleStatus feature={{ id: "linkBlock", title: "Blocare linkuri", description: "", path: ["autoMod", "linkBlock", "enabled"] }} config={config} /></p>
              <p><span>Protecție globală</span><ModuleStatus feature={{ id: "protection", title: "Protecție globală", description: "", path: ["protection", "enabled"] }} config={config} /></p>
            </div>}
          </section>}
          {view === "rpg" && <RpgLivePanel />}
          {selected.id === "staff" || selected.id === "partnership" || selected.id === "help_report" || selected.id === "appeal" || selected.id === "verification" ? <TicketLivePanel moduleId={selected.id} /> : null}
          {selected.id === "conversation" || selected.id === "prophecies" || selected.id === "community" ? <OracleAvailabilityPanel /> : null}
          {selected.id === "activity-log" && <ActivityLogSnapshot config={config} />}
          <FeatureEditor view={view} moduleId={selected.id} />
          {selected.editor && <Link className="ref-editor-link" href={selected.editor}><span>{definition.editorLabel}</span><ArrowUpRight aria-hidden="true" /></Link>}
        </section>}
      </div>
      {loading && <div role="status" className="ref-inline-loading"><i /> Se citesc stările modulelor de moderare…</div>}
      {toggles > 0 && <p className="ref-save-note"><Check aria-hidden="true" /> Comutatoarele actualizează configurația serverului prin API; pentru câmpurile detaliate deschide editorul modulului.</p>}
    </>}
  </div>;
}

function FeatureEditor({ view, moduleId }: { view: string; moduleId: string }) {
  let content: ReactNode = null;
  const categoryByModule: Record<string, "automod" | "anti-spam" | "anti-flood" | "anti-raid" | "suspicious" | "ai" | "tools" | "cases-audit" | "escalation" | "embeds"> = {
    automod: "automod", antispam: "anti-spam", antiflood: "anti-flood", antiraid: "anti-raid",
    suspect: "suspicious", ai: "ai", escalation: "escalation", manualTools: "tools",
    cases: "cases-audit", audit: "cases-audit", "activity-log": "cases-audit",
    autoMod: "automod", embeds: "embeds",
  };

  if (view === "sanctiuni" && moduleId === "manual") content = <CommandsPage />;
  else if (view === "dosare" && moduleId === "cases") content = <CasesPage />;
  else if (view === "dosare" && moduleId === "audit") content = <AuditPage />;
  else if (view === "tichete" && moduleId === "verification") content = <VerificationAdminPage />;
  else if (view === "tichete") content = <BotControlPage initialTab="tickets" />;
  else if (view === "setari" && moduleId === "channels") content = <BotControlPage channelsOnly />;
  else if (view === "setari" && moduleId === "manualTools") content = <CategorySettingsPage section="tools" />;
  else if (view === "setari" && moduleId === "cases") content = <CategorySettingsPage section="cases-audit" />;
  else if (view === "setari" && moduleId === "escalation") content = <CategorySettingsPage section="escalation" />;
  else if (view === "setari" && moduleId === "embeds") content = <CategorySettingsPage section="embeds" />;
  else if (view === "protectie" || view === "judecator" || view === "sanctiuni" || view === "dosare" || view === "setari") {
    const section = categoryByModule[moduleId];
    if (section && !(view === "sanctiuni" && moduleId === "manual")) content = <CategorySettingsPage section={section} />;
  }

  if (!content) return null;
  return <section className="ref-embedded-editor" aria-label="Editorul funcțional al modulului">
    <div className="ref-embedded-editor-head"><span className="ref-eyebrow">Editor funcțional · API server</span><p>Formularul reutilizat din pagina operațională existentă.</p></div>
    {content}
  </section>;
}

function ModuleIcon({ id }: { id: string }) {
  const icons: Record<string, typeof Activity> = {
    automod: Bot, antispam: Activity, antiflood: Activity, antiraid: ShieldAlert, suspect: AlertTriangle,
    ai: Sparkles, escalation: Gavel, manual: Wrench, cases: BookOpen, audit: History,
    "activity-log": Activity, verification: Shield, staff: Users, partnership: Users,
    help_report: CircleHelp, appeal: Gavel, "game-state": Radio, heroes: Users,
    experience: Activity, economy: Trophy, missions: BookOpen, battles: ShieldAlert,
    rankings: Trophy, conversation: MessageCircle, prophecies: Sparkles, community: Users,
    autoMod: Bot, manualTools: Wrench, embeds: FileText, channels: Server,
  };
  const Icon = icons[id] ?? CircleHelp;
  return <Icon aria-hidden="true" />;
}

function TicketLivePanel({ moduleId }: { moduleId: string }) {
  const { guildId } = useActiveGuild();
  const { data, loading, error, refetch } = useBotControl(guildId);
  if (loading) return <div className="ref-inline-loading"><i /> Se citesc setările Control Bot…</div>;
  if (error || !data) return <div className="ref-error" role="alert"><span>{error?.message || "Configurația Control Bot nu este disponibilă."}</span><Button variant="outline" size="sm" onClick={() => void refetch()}>Reîncearcă</Button></div>;
  if (moduleId === "verification") return <div className="ref-live-data"><h3>Configurație verificare</h3><dl>
    <div><dt>Activată în configurație</dt><dd>{data.verification.enabled ? "Da" : "Nu"}</dd></div>
    <div><dt>Canal</dt><dd>{data.verification.channelId || "Neconfigurat"}</dd></div>
    <div><dt>Rol primit</dt><dd>{data.verification.roleId || "Neconfigurat"}</dd></div>
    <div><dt>Panou publicat</dt><dd>{data.verification.panelMessageId ? "ID confirmat" : "Fără ID confirmat"}</dd></div>
  </dl></div>;
  const kind = moduleId as keyof BotControlConfig["tickets"]["flows"];
  const flow = data.tickets.flows[kind];
  const category = data.tickets.categories[kind];
  return <div className="ref-live-data"><h3>Configurația fluxului</h3><dl>
    <div><dt>Categorie Discord</dt><dd>{category || "Neconfigurată"}</dd></div>
    <div><dt>Mod</dt><dd>{flow.mode === "custom" ? "Personalizat" : "Legacy"}</dd></div>
    <div><dt>Titlu panou</dt><dd>{flow.title || "Neconfigurat"}</dd></div>
    <div><dt>Întrebări personalizate</dt><dd>{flow.questions.length}</dd></div>
    <div><dt>Acțiune finală</dt><dd>{flow.completionAction}</dd></div>
  </dl><p>API-ul expune acest flux prin configurația Control Bot. Modificările se fac în editorul dedicat, unde validarea și salvarea sunt deja implementate.</p></div>;
}

function RpgLivePanel() {
  const { guildId } = useActiveGuild();
  const { paused, loading, error, update, refetch } = useGameplayState(guildId);
  const { data, loading: configLoading, error: configError, refetch: refetchConfig } = useBotControl(guildId);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const gameplay = data?.gameplayConfig;
  const toggle = async () => {
    if (paused === null) return;
    setConfirmOpen(false);
    setBusy(true); setActionError("");
    try { await update(!paused); }
    catch (cause) { setActionError(errorText(cause)); }
    finally { setBusy(false); }
  };
  return <div className="ref-live-data">
    <div className={`ref-game-state ${paused === false ? "is-running" : paused === true ? "is-paused" : ""}`}>
      <div><p className="ref-eyebrow">Stare gameplay · API server</p><h3>{loading ? "Se verifică starea" : paused === null ? "Stare necunoscută" : paused ? "Joc oprit" : "Joc activ"}</h3><p>Nu se folosește starea rangurilor de activitate pentru acest modul.</p></div>
      <div className="ref-game-actions">
        <Button variant={paused ? "default" : "destructive"} onClick={() => setConfirmOpen(true)} disabled={loading || busy || paused === null}>{busy ? "Se salvează…" : paused ? "Pornește jocul" : "Oprește jocul"}</Button>
        <Button variant="outline" size="icon" aria-label="Reîncarcă starea jocului" onClick={() => void refetch()} disabled={loading}><RefreshCw aria-hidden="true" /></Button>
      </div>
    </div>
    {(error || actionError) && <div role="alert" className="ref-inline-error">{actionError || error?.message}</div>}
    {configLoading ? <div className="ref-inline-loading"><i /> Se citesc valorile de gameplay…</div> : configError || !gameplay ? <div className="ref-error" role="alert"><span>{configError?.message || "Configurația de gameplay nu este disponibilă."}</span><Button variant="outline" size="sm" onClick={() => void refetchConfig()}>Reîncearcă</Button></div> : <>
      <h3>Configurație confirmată</h3>
      <dl>
        <div><dt>Durata evenimentului</dt><dd>{gameplay.events.eventDurationMinutes} min</dd></div>
        <div><dt>Intervalul boss-ului</dt><dd>{gameplay.events.standaloneBossIntervalMinMinutes}–{gameplay.events.standaloneBossIntervalMaxMinutes} min</dd></div>
        <div><dt>Intervalul cuferelor</dt><dd>{gameplay.events.chestIntervalMinutes} min</dd></div>
        <div><dt>Țintă misiune · monștri</dt><dd>{gameplay.missions.kill_10.target} · recompensă {gameplay.missions.kill_10.rewardQty}</dd></div>
        <div><dt>Țintă misiune · obiecte rare</dt><dd>{gameplay.missions.rare_3.target} · recompensă {gameplay.missions.rare_3.rewardQty}</dd></div>
        <div><dt>Țintă misiune · boss</dt><dd>{gameplay.missions.boss_1.target} · recompensă {gameplay.missions.boss_1.rewardQty}</dd></div>
        <div><dt>Multiplicatori XP</dt><dd>Monștri ×{gameplay.economy.monsterXpMultiplier} · boss ×{gameplay.economy.bossXpMultiplier}</dd></div>
        <div><dt>Aur per monstru</dt><dd>×{gameplay.economy.monsterGoldMultiplier}</dd></div>
        <div><dt>Aur per boss</dt><dd>×{gameplay.economy.bossGoldMultiplier}</dd></div>
      </dl>
      <p>API-ul disponibil oferă starea jocului și aceste valori read-only. Profiluri, clase, inventar, magazin și recompense de clasament nu sunt expuse pentru editare în acest panou.</p>
      <Link className="ref-editor-link" href="/bot?tab=messages"><span>Editează mesajele reale pentru „Joc oprit”</span><ArrowUpRight aria-hidden="true" /></Link>
    </>}
    <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{paused ? "Repornești jocul RPG?" : "Oprești jocul RPG?"}</DialogTitle>
          <DialogDescription>{paused ? "Activitățile de gameplay vor fi repornite pentru serverul selectat." : "Activitățile de gameplay vor fi puse pe pauză pentru serverul selectat."}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setConfirmOpen(false)}>Anulează</Button>
          <Button variant={paused ? "default" : "destructive"} onClick={() => void toggle()}>{paused ? "Pornește jocul" : "Oprește jocul"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>;
}

function OracleAvailabilityPanel() {
  return <div className="ref-readonly"><LockKeyhole aria-hidden="true" /><div><b>Acest modul este read-only</b><p>API-ul autentificat disponibil nu expune setări conversaționale, profeții sau activități comunitare. Nu sunt afișate comutatoare ori valori demonstrative.</p><Link href="/bot?tab=messages">Deschide mesajele reale Control Bot <ChevronRight aria-hidden="true" /></Link></div></div>;
}

function ActivityLogSnapshot({ config }: { config: unknown }) {
  const { guildId } = useActiveGuild();
  const { data: logs, loading, error, refetch } = useAuditLogs(guildId, { limit: 6 });
  const enabled = readPath(config, ["activityLog", "enabled"]) === true;
  return <div className="ref-live-data"><h3>Jurnalul serverului</h3><p>{enabled ? "Jurnalizarea este activă în configurația serverului." : "Jurnalizarea este oprită în configurația serverului."}</p>
    {loading ? <div className="ref-inline-loading"><i /> Se citesc evenimentele…</div> : error ? <div className="ref-error" role="alert"><span>{error.message}</span><Button variant="outline" size="sm" onClick={() => void refetch()}>Reîncearcă</Button></div> : logs.length ? <ul>{logs.slice(0, 4).map((log) => <li key={log.id}>{presentAuditLog(log).title} · {new Date(log.createdAt).toLocaleString("ro-RO")}</li>)}</ul> : <p>Nicio înregistrare returnată de API.</p>}
    <Button variant="outline" size="sm" onClick={() => void refetch()} disabled={loading}><RefreshCw aria-hidden="true" /> Reîncarcă jurnalul</Button>
  </div>;
}

function AssistantView() {
  return <div className="ref-assistant-view"><div className="ref-group-head"><div><p className="ref-eyebrow">Ajutor pentru operatori</p><h1>Asistent AI</h1><p>Căutare locală de navigare; nu pretinde acces la un model AI sau la API-ul de configurare.</p></div><span className="ref-group-icon"><Bot aria-hidden="true" /></span></div><OfflineAssistant /></div>;
}

function ReferenceView({ view }: { view: string }) {
  if (view === "acasa") return <OverviewView />;
  if (view === "asistent") return <AssistantView />;
  return <GroupPage view={view} />;
}

export function ReferenceViewRoute() {
  const params = useParams<{ view: string }>();
  return <ReferenceView view={params.view || "acasa"} />;
}

export function ReferenceHomeView() {
  return <ReferenceView view="acasa" />;
}
