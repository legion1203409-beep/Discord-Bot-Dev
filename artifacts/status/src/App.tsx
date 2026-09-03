import { useCallback, useEffect, useState } from "react";
import "./index.css";
import { computeAlertCard } from "./lib/alert-card";
import dragonLogo from "@assets/277cc950-a62b-11f1-aca9-6f5a63b2ac37_1788465450616.png";

const DISCORD_INVITE = "https://discord.gg/JNYsGeMhzm";
const API_BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

const zones = [
  {
    icon: "⚔",
    name: "Ora Umbrelor",
    eyebrow: "Lupte live",
    description: "Intră în luptă alături de ceilalți aventurieri și înfruntă monștrii care apar în regat.",
    accent: "ember",
  },
  {
    icon: "✦",
    name: "Cuferele Cenușii",
    eyebrow: "Recompense",
    description: "Deschide cufere, adună chei și descoperă resurse pentru următoarea ta aventură.",
    accent: "gold",
  },
  {
    icon: "◆",
    name: "Forja",
    eyebrow: "Progresie",
    description: "Îmbunătățește-ți arma, armura, clasa și companionul. Fiecare upgrade contează.",
    accent: "violet",
  },
  {
    icon: "☽",
    name: "Oracolul",
    eyebrow: "Vocea regatului",
    description: "Pune întrebări, primește profeții și lasă-ți amprenta în poveștile Cenușii.",
    accent: "blue",
  },
];

interface DiscordStats {
  live: boolean;
  onlineCount: number | null;
  totalMembers: number | null;
  lastJoined: string | null;
}

interface OracleHealth {
  reachable: boolean;
  botOnline: boolean;
  shardStatus: string | null;
  botUptime: number;
  oracleReplyMode: "full" | "degraded";
  oracleReplyReason: "active" | "disabled" | "portal_toggle_missing";
  alertsConfigured: boolean;
  alertThresholdMs: number;
}

function useOracleHealth() {
  const [health, setHealth] = useState<OracleHealth | null>(null);

  const fetchHealth = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/healthz`);
      if (!res.ok) throw new Error("bad response");
      const data = await res.json();
      setHealth({
        reachable: true,
        botOnline: Boolean(data.botOnline),
        shardStatus: typeof data.shardStatus === "string" ? data.shardStatus : null,
        botUptime: typeof data.botUptime === "number" ? data.botUptime : 0,
        oracleReplyMode: data.oracleReplyMode === "full" ? "full" : "degraded",
        oracleReplyReason:
          data.oracleReplyReason === "active" || data.oracleReplyReason === "portal_toggle_missing"
            ? data.oracleReplyReason
            : "disabled",
        alertsConfigured: Boolean(data.alertsConfigured),
        alertThresholdMs: typeof data.alertThresholdMs === "number" ? data.alertThresholdMs : 300_000,
      });
    } catch {
      setHealth(null);
    }
  }, []);

  useEffect(() => {
    void fetchHealth();
    const id = setInterval(() => void fetchHealth(), 15_000);
    return () => clearInterval(id);
  }, [fetchHealth]);

  return health;
}

function useSoulStoneStats() {
  const [stats, setStats] = useState<DiscordStats | null>(null);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/discord/stats`);
      if (!res.ok) throw new Error("bad response");
      setStats(await res.json() as DiscordStats);
    } catch {
      setStats({ live: false, onlineCount: null, totalMembers: null, lastJoined: null });
    }
  }, []);

  useEffect(() => {
    void fetchStats();
    const id = setInterval(() => void fetchStats(), 10_000);
    return () => clearInterval(id);
  }, [fetchStats]);

  return stats;
}

function formatUptime(seconds: number): string {
  if (seconds <= 0) return "—";
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days) return `${days}z ${hours}h`;
  if (hours) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function StatusDot({ active = false }: { active?: boolean }) {
  return <span className={`status-dot ${active ? "status-dot--active" : ""}`} aria-hidden="true" />;
}

function DragonLogo({ className = "" }: { className?: string }) {
  return (
    <div className={`dragon-logo ${className}`} aria-hidden="true">
      <img className="dragon-logo-base" src={dragonLogo} alt="" />
    </div>
  );
}

function LandingStatusCard({
  health,
  stats,
}: {
  health: OracleHealth | null;
  stats: DiscordStats | null;
}) {
  const botOnline = health?.botOnline ?? false;
  const statsLive = stats?.live ?? false;

  return (
    <aside className="hero-status-card" aria-label="Starea live a regatului">
      <div className="status-card-topline">
        <span className="eyebrow eyebrow--small">Piatra de Suflete</span>
        <span className={`live-pill ${statsLive ? "live-pill--on" : ""}`}>
          <StatusDot active={statsLive} />
          {stats === null ? "Se verifică" : statsLive ? "Live" : "Offline"}
        </span>
      </div>
      <div className="status-orb-wrap">
        <div className="status-orb"><span>✦</span></div>
        <div>
          <strong>Regatul este {botOnline ? "treaz" : "în așteptare"}</strong>
          <p>Activitatea serverului se actualizează automat.</p>
        </div>
      </div>
      <div className="status-metrics">
        <div>
          <span className="metric-value">{stats?.onlineCount ?? "—"}</span>
          <span className="metric-label">online acum</span>
        </div>
        <div>
          <span className="metric-value">{stats?.totalMembers ?? "—"}</span>
          <span className="metric-label">aventurieri</span>
        </div>
        <div>
          <span className={`metric-value metric-value--${botOnline ? "green" : "muted"}`}>
            {health === null ? "—" : botOnline ? "OK" : "OFF"}
          </span>
          <span className="metric-label">bot Discord</span>
        </div>
      </div>
      <a className="status-card-link" href="#status">
        Vezi starea completă <span>↗</span>
      </a>
    </aside>
  );
}

function LandingPage() {
  const health = useOracleHealth();
  const stats = useSoulStoneStats();

  return (
    <div className="landing-page">
      <div className="landing-noise" aria-hidden="true" />
      <header className="site-nav">
        <a className="brand" href="#" aria-label="Regatul Cenușii, acasă">
          <span className="brand-mark brand-mark--logo"><img src={dragonLogo} alt="" /></span>
          <span>
            <strong>REGATUL</strong>
            <small>CENUȘII</small>
          </span>
        </a>
        <nav className="nav-links" aria-label="Navigație principală">
          <a href="#lumea">Lumea</a>
          <a href="#cum-incepi">Cum începi</a>
          <a href="#status">Stare live</a>
        </nav>
        <a className="nav-cta" href={DISCORD_INVITE} target="_blank" rel="noopener noreferrer">
          Intră pe Discord <span>↗</span>
        </a>
      </header>

      <main>
        <section className="hero-section">
          <div className="hero-backdrop" aria-hidden="true" />
          <div className="hero-content page-width">
            <div className="hero-copy">
              <div className="eyebrow"><span className="eyebrow-line" /> Server Discord RPG</div>
              <h1>Legenda ta începe <em>în Cenușă.</em></h1>
              <p className="hero-lead">
                Un regat întunecat, viu și plin de aventuri. Luptă pentru glorie,
                construiește-ți eroul și scrie următorul capitol alături de comunitate.
              </p>
              <div className="hero-actions">
                <a className="button button--primary" href={DISCORD_INVITE} target="_blank" rel="noopener noreferrer">
                  <span className="button-icon">◈</span> Alătură-te regatului <span className="button-arrow">↗</span>
                </a>
                <a className="text-link" href="#lumea">Descoperă lumea <span>↓</span></a>
              </div>
              <div className="hero-proof">
                <span className="proof-avatars" aria-hidden="true"><i>⚔</i><i>☽</i><i>✦</i></span>
                <span><strong>O comunitate în creștere</strong><br />Aventuri noi în fiecare zi</span>
              </div>
            </div>
            <div className="hero-aside">
              <DragonLogo className="dragon-logo--hero" />
              <LandingStatusCard health={health} stats={stats} />
            </div>
          </div>
          <div className="hero-scroll-hint" aria-hidden="true"><span /> Scroll pentru a intra în regat</div>
        </section>

        <section className="intro-section page-width" id="lumea">
          <div className="section-heading">
            <div>
              <div className="eyebrow"><span className="eyebrow-line" /> Ce te așteaptă</div>
              <h2>Nu este doar un server.<br /><em>Este povestea ta.</em></h2>
            </div>
            <p>
              Regatul Cenușii aduce mecanici RPG, evenimente live și o lume care
              evoluează odată cu jucătorii ei. Intră când vrei. Lasă o legendă.
            </p>
          </div>
          <div className="feature-grid">
            {zones.map((zone, index) => (
              <a
                className={`feature-card feature-card--${zone.accent}`}
                href={DISCORD_INVITE}
                target="_blank"
                rel="noopener noreferrer"
                key={zone.name}
              >
                <span className="feature-number">0{index + 1}</span>
                <span className="feature-icon">{zone.icon}</span>
                <span className="feature-eyebrow">{zone.eyebrow}</span>
                <h3>{zone.name}</h3>
                <p>{zone.description}</p>
                <span className="feature-link">Descoperă <b>↗</b></span>
              </a>
            ))}
          </div>
        </section>

        <section className="quote-section">
          <div className="page-width quote-inner">
            <span className="quote-mark">“</span>
            <blockquote>În Cenușă nu contează de unde ai venit.<br /><em>Contează ce alegi să devii.</em></blockquote>
            <span className="quote-rule" />
            <span className="quote-attribution">— Cronica Regatului</span>
          </div>
        </section>

        <section className="journey-section page-width" id="cum-incepi">
          <div className="section-heading section-heading--center">
            <div>
              <div className="eyebrow"><span className="eyebrow-line" /> Primii pași</div>
              <h2>Intră. <em>Alege.</em> Evoluează.</h2>
            </div>
            <p>Nu ai nevoie de experiență. Doar de curajul de a deschide poarta.</p>
          </div>
          <div className="journey-grid">
            <div className="journey-step">
              <span className="step-icon">01</span>
              <div><h3>Alătură-te</h3><p>Intră pe serverul Discord și primește-ți locul în Regat.</p></div>
            </div>
            <div className="journey-connector" aria-hidden="true">→</div>
            <div className="journey-step">
              <span className="step-icon">02</span>
              <div><h3>Alege-ți calea</h3><p>Descoperă clasele, companionii și echipamentul potrivit.</p></div>
            </div>
            <div className="journey-connector" aria-hidden="true">→</div>
            <div className="journey-step">
              <span className="step-icon">03</span>
              <div><h3>Scrie legenda</h3><p>Luptă în evenimente, urcă în clasament și devino de neuitat.</p></div>
            </div>
          </div>
        </section>

        <section className="cta-section page-width">
          <div className="cta-card">
            <div className="cta-glow" aria-hidden="true" />
            <div className="cta-copy">
              <div className="eyebrow"><span className="eyebrow-line" /> Poarta este deschisă</div>
              <h2>Locul tău în Regat<br /><em>te așteaptă.</em></h2>
              <p>Alătură-te comunității și începe aventura chiar acum.</p>
              <a className="button button--primary" href={DISCORD_INVITE} target="_blank" rel="noopener noreferrer">
                Intră pe Discord <span className="button-arrow">↗</span>
              </a>
            </div>
            <DragonLogo className="dragon-logo--cta" />
          </div>
        </section>
      </main>

      <footer className="site-footer page-width">
        <a className="brand brand--footer" href="#">
          <span className="brand-mark brand-mark--logo"><img src={dragonLogo} alt="" /></span>
          <span><strong>REGATUL</strong><small>CENUȘII</small></span>
        </a>
        <span>O lume creată pentru cei care aleg să lupte.</span>
        <a href={DISCORD_INVITE} target="_blank" rel="noopener noreferrer">discord.gg/JNYsGeMhzm <span>↗</span></a>
      </footer>
    </div>
  );
}

function OperatorHealthPage() {
  const health = useOracleHealth();
  const botTone = health === null ? "loading" : health.botOnline ? "ok" : "danger";
  const botLabel = health === null ? "Se verifică…" : health.botOnline ? "Online" : "Offline";

  let replyTone: "loading" | "ok" | "warn" | "danger";
  let replyLabel: string;
  let replyDetail: string;
  if (health === null) {
    replyTone = "loading";
    replyLabel = "Se verifică…";
    replyDetail = "Se interoghează /api/healthz.";
  } else if (health.oracleReplyMode === "full") {
    replyTone = "ok";
    replyLabel = "Complet (active)";
    replyDetail = "Răspunde la fiecare reply, mențiune și ping.";
  } else if (health.oracleReplyReason === "portal_toggle_missing") {
    replyTone = "danger";
    replyLabel = "Redus (portal_toggle_missing)";
    replyDetail = "Comutatorul „Message Content” lipsește din Developer Portal. Activează-l, apoi repornește botul.";
  } else {
    replyTone = "warn";
    replyLabel = "Redus (disabled)";
    replyDetail = "Răspunsul la toate reply-urile este dezactivat din configurare.";
  }

  const { tone: alertTone, label: alertLabel, detail: alertDetail } = computeAlertCard(health);

  return (
    <div className="ops-page">
      <div className="ops-panel">
        <header className="ops-head">
          <a className="ops-back" href="#">← Înapoi la pagina principală</a>
          <h1 className="ops-title">✦ Starea operatorului</h1>
          <p className="ops-sub">{health === null ? "Nu se poate contacta /api/healthz." : "Date live · reîmprospătare la 15 secunde"}</p>
        </header>
        <div className="ops-grid">
          <div className={`ops-card ops-card--${botTone}`}><span className="ops-card-label">Bot Discord</span><span className="ops-card-value"><span className="ops-dot" />{botLabel}</span></div>
          <div className="ops-card"><span className="ops-card-label">Shard</span><span className="ops-card-value">{health?.shardStatus ?? "—"}</span></div>
          <div className="ops-card"><span className="ops-card-label">Uptime bot</span><span className="ops-card-value">{health ? formatUptime(health.botUptime) : "…"}</span></div>
          <div className={`ops-card ops-card--${replyTone}`}><span className="ops-card-label">Mod răspuns</span><span className="ops-card-value"><span className="ops-dot" />{replyLabel}</span><span className="ops-card-detail">{replyDetail}</span></div>
          <div className={`ops-card ops-card--${alertTone}`}><span className="ops-card-label">Alerte push</span><span className="ops-card-value"><span className="ops-dot" />{alertLabel}</span><span className="ops-card-detail">{alertDetail}</span></div>
        </div>
        <footer className="ops-foot">
          <a href={`${API_BASE}/api/healthz`} target="_blank" rel="noopener noreferrer">Vezi JSON brut</a>
          <a href="#">Pagina principală →</a>
        </footer>
      </div>
    </div>
  );
}

export default function App() {
  const hash = window.location.hash;
  if (hash === "#ops" || hash === "#status") return <OperatorHealthPage />;
  return <LandingPage />;
}