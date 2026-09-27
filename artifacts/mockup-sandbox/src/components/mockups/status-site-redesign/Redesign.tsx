import { useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  Bot,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  Clock,
  Eye,
  FileText,
  Gavel,
  History,
  LogOut,
  Menu,
  MessageSquareWarning,
  Monitor,
  PauseCircle,
  PlayCircle,
  Radio,
  Server,
  Settings,
  Shield,
  ShieldAlert,
  SlidersHorizontal,
  Sparkles,
  Users,
  Wrench,
  X,
  XCircle,
  Zap,
} from "lucide-react";
import "./_group.css";
import "./Redesign.css";

type Icon = typeof Activity;

type MockModule = {
  key: string;
  name: string;
  description: string;
  href: string;
  icon: Icon;
  enabled: boolean;
  active: boolean;
  parentEnabled: boolean;
};

const navigation: Array<{
  id: string;
  label: string;
  items: Array<{ href: string; icon: Icon; label: string }>;
}> = [
  {
    id: "overview",
    label: "Privire generală",
    items: [{ href: "/", icon: Activity, label: "Ansamblu" }],
  },
  {
    id: "protection",
    label: "Protecție și detecție",
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
    label: "Moderare și evidențe",
    items: [
      { href: "/politici", icon: BookOpen, label: "Politici generale" },
      { href: "/comenzi", icon: Zap, label: "Acțiuni manuale" },
      { href: "/cazuri", icon: ShieldAlert, label: "Cazuri" },
      { href: "/audit", icon: History, label: "Loguri și audit" },
    ],
  },
  {
    id: "configuration",
    label: "Configurare",
    items: [
      { href: "/config", icon: Settings, label: "Configurare module" },
      { href: "/config/avansat", icon: SlidersHorizontal, label: "Setări avansate" },
      { href: "/config/unelte", icon: Zap, label: "Unelte staff" },
      { href: "/config/cazuri-audit", icon: FileText, label: "Setări cazuri și audit" },
      { href: "/config/escaladare", icon: Gavel, label: "Escaladare" },
      { href: "/config/embeduri", icon: Sparkles, label: "Embed-uri" },
    ],
  },
  {
    id: "bot-control",
    label: "Control bot",
    items: [
      { href: "/canale", icon: Radio, label: "Canale" },
      { href: "/provisioning", icon: Wrench, label: "Provisioning" },
      { href: "/bot?tab=roles", icon: Users, label: "Roluri" },
      { href: "/bot?tab=tickets", icon: SlidersHorizontal, label: "Tichete" },
      { href: "/verificare", icon: Shield, label: "Verificare" },
      { href: "/bot?tab=messages", icon: Activity, label: "Mesaje" },
      { href: "/bot?tab=statistics", icon: Monitor, label: "Statistici" },
    ],
  },
];

const seedModules: MockModule[] = [
  {
    key: "autoMod",
    name: "AutoMod",
    description: "Filtre clasice și sincronizare Discord AutoMod nativ.",
    href: "/automod",
    active: true,
    enabled: true,
    parentEnabled: true,
    icon: Bot,
  },
  {
    key: "wordFilter",
    name: "Filtru cuvinte",
    description: "Cuvinte interzise și acțiunea aplicată la detectare.",
    href: "/automod",
    active: true,
    enabled: true,
    parentEnabled: true,
    icon: BookOpen,
  },
  {
    key: "linkBlock",
    name: "Blocare linkuri",
    description: "Linkuri interzise și răspunsul automat asociat.",
    href: "/automod",
    active: false,
    enabled: false,
    parentEnabled: true,
    icon: Zap,
  },
  {
    key: "antiRaid",
    name: "Anti-Raid",
    description: "Valuri de intrări și conturi prea noi.",
    href: "/anti-raid",
    active: true,
    enabled: true,
    parentEnabled: true,
    icon: ShieldAlert,
  },
  {
    key: "antiSpam",
    name: "Anti-Spam",
    description: "Mesaje, editări, mențiuni și emoji repetitive.",
    href: "/anti-spam",
    active: false,
    enabled: false,
    parentEnabled: true,
    icon: Activity,
  },
  {
    key: "antiFlood",
    name: "Anti-Flood",
    description: "Mesaje lungi și șiruri excesive.",
    href: "/anti-flood",
    active: false,
    enabled: false,
    parentEnabled: true,
    icon: Activity,
  },
  {
    key: "suspiciousBehavior",
    name: "Comportament suspect",
    description: "Alerte pentru activitate și schimbări neobișnuite.",
    href: "/comportament-suspect",
    active: false,
    enabled: false,
    parentEnabled: true,
    icon: ShieldAlert,
  },
  {
    key: "ai",
    name: "Moderare AI",
    description: "Analiză inteligentă separată de AutoMod.",
    href: "/ai",
    active: true,
    enabled: true,
    parentEnabled: true,
    icon: Bot,
  },
];

const auditLogs = [
  {
    id: "1",
    actor: "Administrator",
    title: "A actualizat protecția serverului",
    details: "Modulele principale sunt active.",
    time: "10:42",
  },
  {
    id: "2",
    actor: "Cronicar",
    title: "A modificat regulile AutoMod",
    details: "Filtrul de cuvinte a fost salvat.",
    time: "10:36",
  },
  {
    id: "3",
    actor: "Moderator",
    title: "A închis cazul #184",
    details: "Acțiunea a fost înregistrată.",
    time: "10:18",
  },
  {
    id: "4",
    actor: "Administrator",
    title: "A configurat canalul de audit",
    details: "Canalul consiliului este sincronizat.",
    time: "09:54",
  },
  {
    id: "5",
    actor: "Sistem",
    title: "Sincronizare Discord finalizată",
    details: "Toate permisiunile sunt actualizate.",
    time: "09:41",
  },
];

function stopNavigation(event: React.MouseEvent<HTMLAnchorElement>) {
  event.preventDefault();
}

function BrandMark() {
  return (
    <span className="sr-brand-mark">
      <Eye aria-hidden="true" size={16} />
    </span>
  );
}

function Toggle({
  on,
  label,
  onClick,
  small = false,
}: {
  on: boolean;
  label: string;
  onClick: () => void;
  small?: boolean;
}) {
  return (
    <button
      type="button"
      className={small ? "sr-toggle sr-toggle-small" : "sr-toggle"}
      data-on={on}
      aria-label={label}
      aria-pressed={on}
      onClick={onClick}
    >
      <span />
    </button>
  );
}

function Sidebar({
  active,
  setActive,
  open,
  close,
}: {
  active: string;
  setActive: (href: string) => void;
  open: boolean;
  close: () => void;
}) {
  return (
    <aside className="sr-sidebar" data-open={open} aria-label="Navigare moderare">
      <div className="sr-brand">
        <BrandMark />
        <div>
          <div className="sr-brand-name">ORACOLUL</div>
          <span className="sr-brand-meta">BOT / CONSOLĂ</span>
        </div>
        <button
          type="button"
          className="sr-mobile-menu-button"
          onClick={close}
          aria-label="Închide meniul"
        >
          <X size={16} aria-hidden="true" />
        </button>
      </div>

      <div className="sr-sidebar-scroll">
        <label className="sr-side-label" htmlFor="redesign-server">
          Server curent
        </label>
        <select
          id="redesign-server"
          className="sr-server-select"
          aria-label="Server curent"
          defaultValue="Serverul lui LEGION"
        >
          <option>Serverul lui LEGION</option>
        </select>

        <nav className="sr-nav" aria-label="Categorii de moderare">
          {navigation.map((group) => (
            <section className="sr-nav-group" key={group.id}>
              <h2 className="sr-nav-heading">
                <span>{group.label}</span>
                <span>{String(group.items.length).padStart(2, "0")}</span>
              </h2>
              {group.items.map((item) => {
                const ItemIcon = item.icon;
                const isActive = active === item.href;
                return (
                  <a
                    className="sr-nav-item"
                    data-active={isActive}
                    href={item.href}
                    key={item.href}
                    aria-current={isActive ? "page" : undefined}
                    onClick={(event) => {
                      stopNavigation(event);
                      setActive(item.href);
                      close();
                    }}
                  >
                    <ItemIcon aria-hidden="true" />
                    <span>{item.label}</span>
                  </a>
                );
              })}
            </section>
          ))}
        </nav>
      </div>

      <div className="sr-sidebar-footer">
        <Server size={14} aria-hidden="true" />
        <span>Serverul lui LEGION</span>
        <LogOut className="sr-footer-logout" size={13} aria-hidden="true" />
      </div>
    </aside>
  );
}

function ActivityRail() {
  return (
    <aside className="sr-rail" aria-label="Activitate recentă">
      <header className="sr-rail-header">
        <div className="sr-rail-title">Activitate Recentă</div>
        <span className="sr-rail-count" aria-label={`${auditLogs.length} evenimente`}>
          {auditLogs.length}
        </span>
      </header>
      <p className="sr-rail-intro">
        Jurnalul operațiunilor înregistrate pentru Serverul lui LEGION.
      </p>
      <div className="sr-activity">
        {auditLogs.map((log) => (
          <div className="sr-activity-row" key={log.id}>
            <span className="sr-activity-dot" aria-hidden="true" />
            <div className="sr-activity-copy">
              <p className="sr-activity-title">
                <strong>{log.actor}</strong>
                <span> · </span>
                <em>{log.title}</em>
              </p>
              <p className="sr-activity-detail">{log.details}</p>
            </div>
            <time className="sr-activity-time">{log.time}</time>
          </div>
        ))}
      </div>
      <div className="sr-rail-footer">
        <a
          className="sr-rail-link"
          href="/audit"
          onClick={stopNavigation}
          data-testid="link-dashboard-audit"
        >
          Vezi tot <ChevronRight size={12} aria-hidden="true" />
        </a>
      </div>
    </aside>
  );
}

function DashboardOverview() {
  const [gamePaused, setGamePaused] = useState<boolean | null>(false);
  const [protectionEnabled, setProtectionEnabled] = useState(true);
  const [modules, setModules] = useState(seedModules);
  const activeGuild = { name: "Serverul lui LEGION" };
  const openCases = 3;

  const toggleModule = (key: string) => {
    setModules((current) =>
      current.map((module) =>
        module.key === key
          ? {
              ...module,
              enabled: !module.enabled,
              active: !module.enabled && protectionEnabled,
            }
          : module,
      ),
    );
  };

  return (
    <div className="sr-main-inner">
      <div className="sr-topline">
        <div className="sr-topline-copy">
          <div className="sr-section-label">Sesiune autentificată</div>
          <h1 className="sr-page-title">{activeGuild.name}</h1>
          <p className="sr-page-subtitle">
            Consola operatorului pentru gestionarea securității. Orice modificare se aplică instantaneu în regat.
          </p>
        </div>
        <a
          className="sr-config-link"
          href="/config"
          onClick={stopNavigation}
          data-testid="link-dashboard-settings"
        >
          <Settings size={13} aria-hidden="true" />
          Configurare
          <ArrowUpRight size={11} aria-hidden="true" />
        </a>
      </div>

      <section className="sr-game-state" aria-label="Control stare joc">
        <div className="sr-game-copy">
          <span className="sr-state-icon">
            {gamePaused === true ? (
              <PlayCircle size={16} aria-hidden="true" />
            ) : gamePaused === false ? (
              <PauseCircle size={16} aria-hidden="true" />
            ) : (
              <AlertTriangle size={16} aria-hidden="true" />
            )}
          </span>
          <div>
            <div className="sr-section-label">
              {gamePaused === null ? "Stare necunoscută" : gamePaused ? "Joc suspendat" : "Joc activ"}
            </div>
            <h2 className="sr-game-title">
              {gamePaused === null
                ? "Starea jocului nu este confirmată"
                : gamePaused
                  ? "Activitățile sunt oprite"
                  : "Regatul rulează normal"}
            </h2>
            <p className="sr-game-description">
              {gamePaused === null
                ? "Starea nu este disponibilă momentan; comanda de oprire sau repornire este dezactivată până la confirmarea serverului."
                : gamePaused
                  ? "Evenimentele, luptele, cuferele și recompensele sunt blocate până la repornire."
                  : "Poți suspenda temporar activitățile jocului fără să oprești moderarea sau Oracle AI."}
            </p>
          </div>
        </div>
        <button
          type="button"
          className="sr-danger-button"
          onClick={() => setGamePaused((current) => (current === null ? false : !current))}
        >
          {gamePaused === true ? (
            <PlayCircle size={14} aria-hidden="true" />
          ) : (
            <PauseCircle size={14} aria-hidden="true" />
          )}
          {gamePaused ? "Pornește jocul" : "Oprește jocul"}
        </button>
      </section>

      <section className="sr-metrics" aria-label="Indicatori principali">
        <div className="sr-metric">
          <div className="sr-metric-head">
            <span>Cazuri deschise</span>
            <AlertTriangle aria-hidden="true" />
          </div>
          <strong className="sr-metric-value">{openCases}</strong>
          <span className="sr-metric-note">
            <Clock size={10} aria-hidden="true" /> revizuire
          </span>
          <div className="sr-meter" aria-hidden="true">
            <span />
          </div>
        </div>
        <div className="sr-metric">
          <div className="sr-metric-head">
            <span>Scut AutoMod</span>
            <Shield aria-hidden="true" />
          </div>
          <strong className="sr-metric-value">
            {protectionEnabled && modules[0].enabled ? "Activ" : "Oprit"}
          </strong>
          <span className="sr-metric-note">monitorizare live</span>
          <div className="sr-meter" aria-hidden="true">
            <span />
          </div>
        </div>
        <div className="sr-metric">
          <div className="sr-metric-head">
            <span>Loguri audit azi</span>
            <Activity aria-hidden="true" />
          </div>
          <strong className="sr-metric-value">{auditLogs.length}</strong>
          <span className="sr-metric-note">evenimente</span>
          <div className="sr-meter" aria-hidden="true">
            <span />
            <span />
            <span />
            <span />
          </div>
        </div>
      </section>

      <section className="sr-modules" aria-label="Module de protecție">
        <div className="sr-section-header">
          <div>
            <div className="sr-section-label">Sisteme</div>
            <h2 className="sr-section-title">Module de Protecție</h2>
          </div>
          <div className="sr-protection-control">
            <span>{protectionEnabled ? "Activă" : "Oprită"}</span>
            <Toggle
              on={protectionEnabled}
              label="Activează sau oprește toată protecția"
              onClick={() => setProtectionEnabled((value) => !value)}
            />
          </div>
        </div>
        <div className="sr-module-grid">
          {modules.map((module) => {
            const ModuleIcon = module.icon;
            const status = module.active
              ? "Activ"
              : module.enabled && !protectionEnabled
                ? "Configurat · protecția globală oprită"
                : module.enabled && !module.parentEnabled
                  ? "Configurat · AutoMod oprit"
                  : "Inactiv";
            return (
              <article className="sr-module" data-on={module.enabled} key={module.key}>
                <span className="sr-module-icon">
                  <ModuleIcon size={13} aria-hidden="true" />
                </span>
                <a
                  className="sr-module-copy"
                  href={module.href}
                  onClick={stopNavigation}
                  data-testid={`link-module-${module.key}`}
                >
                  <h3 className="sr-module-name">
                    {module.name}
                    <ChevronRight aria-hidden="true" />
                  </h3>
                  <p className="sr-module-description">{module.description}</p>
                  <p className="sr-module-status" data-active={module.active}>
                    {module.active ? (
                      <CheckCircle2 aria-hidden="true" />
                    ) : module.enabled ? (
                      <PauseCircle aria-hidden="true" />
                    ) : (
                      <XCircle aria-hidden="true" />
                    )}
                    {status}
                  </p>
                </a>
                <div className="sr-module-toggle">
                  <Toggle
                    small
                    on={module.enabled}
                    label={`${module.enabled ? "Dezactivează" : "Activează"} ${module.name}`}
                    onClick={() => toggleModule(module.key)}
                  />
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}

export function Redesign() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [active, setActive] = useState("/");

  return (
    <div className="status-redesign">
      <div
        className="sr-mobile-overlay"
        data-open={mobileMenuOpen}
        onClick={() => setMobileMenuOpen(false)}
        aria-hidden="true"
      />
      <div className="sr-layout">
        <Sidebar
          active={active}
          setActive={setActive}
          open={mobileMenuOpen}
          close={() => setMobileMenuOpen(false)}
        />
        <main className="sr-main">
          <header className="sr-mobile-bar">
            <div className="sr-mobile-brand">
              <BrandMark />
              <span>ORACOLUL</span>
            </div>
            <button
              type="button"
              className="sr-mobile-menu-button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Deschide meniul"
              aria-expanded={mobileMenuOpen}
            >
              <Menu size={17} aria-hidden="true" />
            </button>
          </header>
          <DashboardOverview />
        </main>
        <ActivityRail />
      </div>
    </div>
  );
}