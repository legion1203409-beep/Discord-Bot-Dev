import { useCallback, useEffect, useState, type ReactNode } from "react";
import "./index.css";
import { computeAlertCard } from "./lib/alert-card";
import { trackEvent } from "./lib/analytics";
import dragonLogo from "@assets/277cc950-a62b-11f1-aca9-6f5a63b2ac37_1788465450616.png";

const DISCORD_INVITE = "https://discord.gg/JNYsGeMhzm";
const API_BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

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

const realmFeatures = [
  { number: "I", eyebrow: "Lupte live", title: "Ora Umbrelor", body: "Monștri, dueluri și primejdii care se nasc în timp real. Intră în luptă când chemarea se aude.", tone: "ember", icon: "sword" },
  { number: "II", eyebrow: "Progresie", title: "Forja celor vii", body: "Construiește-ți eroul, rafinează-ți echipamentul și fă ca fiecare victorie să lase urme.", tone: "gold", icon: "anvil" },
  { number: "III", eyebrow: "Recompense", title: "Cuferele Cenușii", body: "Chei, relicve și resurse pentru cei care au răbdarea să caute în ruine.", tone: "violet", icon: "chest" },
  { number: "IV", eyebrow: "Vocea regatului", title: "Oracolul", body: "Un companion care ascultă, răspunde și ține ritmul unei comunități în continuă mișcare.", tone: "blue", icon: "eye" },
];

const factions = [
  { name: "Veghetorii Nordului", mark: "V", color: "ember", copy: "Jură să apere zidurile atunci când ceața coboară peste trecători.", detail: "DISCIPLINĂ · HOTAR" },
  { name: "Cronicarii de Sare", mark: "S", color: "gold", copy: "Adună povești, schimbă secrete și cunosc numele tuturor relicvelor.", detail: "MEMORIE · TAINĂ" },
  { name: "Fiii Fumului", mark: "F", color: "violet", copy: "Caută puterea în locurile pe care ceilalți le-au lăsat să ardă.", detail: "RISC · TRANSFORMARE" },
];

const champions = [
  { rank: "01", name: "Aurelia Vânt-de-Sare", title: "Căpitană a Veghetorilor", score: "2.841 XP", tone: "ember" },
  { rank: "02", name: "Dorian din Turnul Gol", title: "Arhivar al Cronicarilor", score: "2.517 XP", tone: "gold" },
  { rank: "03", name: "Mara Cenușie", title: "Vânătoare de relicve", score: "2.306 XP", tone: "violet" },
];

const events = [
  { date: "JOI · 21:00", name: "Chemarea din Mlaștină", status: "urmează", copy: "O creatură veche s-a trezit. Toate săbiile sunt chemate la marginea regatului." },
  { date: "SÂMBĂTĂ · 20:30", name: "Turnirul celor Nouă", status: "înscrieri", copy: "Dueluri scurte, mize mari și un singur nume gravat în piatra arenei." },
  { date: "DUMINICĂ · 19:00", name: "Tavernă deschisă", status: "recurring", copy: "Povești din săptămână, muzică și planuri pentru următoarea aventură." },
];

function Icon({ name, size = 22 }: { name: string; size?: number }) {
  const paths: Record<string, ReactNode> = {
    sword: <><path d="m5 19 5.2-5.2" /><path d="m14.8 10.2 4.7-4.7-1-3-3 1-4.7 4.7" /><path d="m7.5 16.5-2.9-.1.1-2.9" /><path d="m10.1 13.9 2 2" /></>,
    anvil: <><path d="M4 19h16" /><path d="M6 16h12" /><path d="m8 12 2-7h4l2 7" /><path d="M5 12h14" /><path d="M10 5 8 3h8l-2 2" /></>,
    chest: <><path d="M4 8h16v11H4z" /><path d="M4 8 6 4h12l2 4" /><path d="M4 13h16" /><path d="M11 13h2v3h-2z" /></>,
    eye: <><path d="M2.5 12s3.3-5 9.5-5 9.5 5 9.5 5-3.3 5-9.5 5-9.5-5-9.5-5Z" /><circle cx="12" cy="12" r="2.2" /></>,
    arrow: <><path d="M5 12h13" /><path d="m13 7 5 5-5 5" /></>,
    compass: <><circle cx="12" cy="12" r="8.5" /><path d="m15.5 8.5-2.2 4.8-4.8 2.2 2.2-4.8 4.8-2.2Z" /></>,
    crown: <><path d="m4 8 3 3 5-6 5 6 3-3-2 9H6L4 8Z" /><path d="M6 20h12" /></>,
    flame: <><path d="M12 21c4 0 6.5-2.6 6.5-6.2 0-3-2.2-5.1-4.2-7.8-.2 2.2-1.3 3.3-2.3 4.1.2-3.6-1.2-5.8-2.5-7.1C9.6 7.7 5.5 10 5.5 14.7 5.5 18.5 8.1 21 12 21Z" /></>,
    mark: <><path d="m12 3 2.4 6.1L21 12l-6.6 2.5L12 21l-2.4-6.5L3 12l6.6-2.9L12 3Z" /></>,
  };
  return <svg className="icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name] ?? paths.mark}</svg>;
}

function useOracleHealth() {
  const [health, setHealth] = useState<OracleHealth | null>(null);
  const fetchHealth = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/api/healthz`);
      if (!response.ok) throw new Error("bad response");
      const data = await response.json();
      setHealth({
        reachable: true,
        botOnline: Boolean(data.botOnline),
        shardStatus: typeof data.shardStatus === "string" ? data.shardStatus : null,
        botUptime: typeof data.botUptime === "number" ? data.botUptime : 0,
        oracleReplyMode: data.oracleReplyMode === "full" ? "full" : "degraded",
        oracleReplyReason: data.oracleReplyReason === "active" || data.oracleReplyReason === "portal_toggle_missing" ? data.oracleReplyReason : "disabled",
        alertsConfigured: Boolean(data.alertsConfigured),
        alertThresholdMs: typeof data.alertThresholdMs === "number" ? data.alertThresholdMs : 300_000,
      });
    } catch {
      setHealth(null);
    }
  }, []);
  useEffect(() => {
    void fetchHealth();
    const interval = window.setInterval(() => void fetchHealth(), 15_000);
    return () => window.clearInterval(interval);
  }, [fetchHealth]);
  return health;
}

function useSoulStoneStats() {
  const [stats, setStats] = useState<DiscordStats | null>(null);
  const fetchStats = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/api/discord/stats`);
      if (!response.ok) throw new Error("bad response");
      setStats(await response.json() as DiscordStats);
    } catch {
      setStats({ live: false, onlineCount: null, totalMembers: null, lastJoined: null });
    }
  }, []);
  useEffect(() => {
    void fetchStats();
    const interval = window.setInterval(() => void fetchStats(), 10_000);
    return () => window.clearInterval(interval);
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
  return <div className={`dragon-logo ${className}`} aria-hidden="true"><img src={dragonLogo} alt="" /></div>;
}

function AshCore({ compact = false }: { compact?: boolean }) {
  return <div className={`ash-core ${compact ? "ash-core--compact" : ""}`} aria-hidden="true">
    <span className="core-ring core-ring--one" /><span className="core-ring core-ring--two" /><span className="core-ring core-ring--three" />
    <span className="core-spark core-spark--one" /><span className="core-spark core-spark--two" /><span className="core-spark core-spark--three" />
    <span className="core-flare" />
  </div>;
}

function LiveRealm({ health, stats }: { health: OracleHealth | null; stats: DiscordStats | null }) {
  const botOnline = health?.botOnline ?? false;
  const isLive = stats?.live ?? false;
  return <section className="live-section page-width" id="stare-live" aria-labelledby="live-heading">
    <div className="live-copy">
      <div className="eyebrow"><span className="eyebrow-line" /> Pulsul regatului</div>
      <h2 id="live-heading">Cenușa nu doarme<br /><em>niciodată.</em></h2>
      <p>Piatra de Suflete păstrează ritmul serverului. Cifrele de mai jos sunt citite direct din Discord și se schimbă odată cu lumea.</p>
       <a className="quiet-link" href="#status" onClick={() => trackEvent("operator_status_open", { location: "live_realm" })} data-testid="link-live-status">Deschide consola operatorului <Icon name="arrow" size={17} /></a>
    </div>
    <div className="live-core-panel">
      <div className="hud-corner hud-corner--tl" /><div className="hud-corner hud-corner--br" />
      <div className="core-label"><StatusDot active={isLive} /> <span>ASH CORE / {isLive ? "SYNC" : "STANDBY"}</span></div>
      <AshCore />
      <div className="core-readout"><span>REȚEA DISCORD</span><strong>{botOnline ? "TREAZĂ" : "ÎN AȘTEPTARE"}</strong></div>
      <div className="core-axis core-axis--x" /><div className="core-axis core-axis--y" />
    </div>
    <div className="live-metrics" data-testid="stats-live-panel">
      <div className="live-metric"><span className="metric-kicker">AVENTURIERI ONLINE</span><strong data-testid="text-online-count">{stats?.onlineCount ?? "—"}</strong><span className="metric-status"><StatusDot active={isLive} /> actualizat live</span></div>
      <div className="live-metric"><span className="metric-kicker">MEMBRI AI REGATULUI</span><strong data-testid="text-total-members">{stats?.totalMembers ?? "—"}</strong><span className="metric-status"><StatusDot active={isLive} /> comunitate</span></div>
      <div className="live-metric live-metric--wide"><span className="metric-kicker">ULTIMA SOSIRE</span><strong>{stats?.lastJoined ?? "—"}</strong><span className="metric-status"><StatusDot active={isLive} /> poarta deschisă</span></div>
    </div>
  </section>;
}

function LandingStatusCard({ health, stats }: { health: OracleHealth | null; stats: DiscordStats | null }) {
  const botOnline = health?.botOnline ?? false;
  const statsLive = stats?.live ?? false;
  return <aside className="hero-status-card" aria-label="Starea live a regatului" data-testid="card-hero-status">
    <div className="status-card-topline"><span className="eyebrow eyebrow--small">Piatra de Suflete</span><span className={`live-pill ${statsLive ? "live-pill--on" : ""}`}><StatusDot active={statsLive} />{stats === null ? "Se verifică" : statsLive ? "Live" : "Offline"}</span></div>
    <div className="status-orb-wrap"><AshCore compact /><div><strong>Regatul este {botOnline ? "treaz" : "în așteptare"}</strong><p>Activitatea serverului se actualizează automat.</p></div></div>
    <div className="status-metrics">
      <div><span className="metric-value">{stats?.onlineCount ?? "—"}</span><span className="metric-label">online acum</span></div>
      <div><span className="metric-value">{stats?.totalMembers ?? "—"}</span><span className="metric-label">aventurieri</span></div>
      <div><span className={`metric-value metric-value--${botOnline ? "green" : "muted"}`}>{health === null ? "—" : botOnline ? "OK" : "OFF"}</span><span className="metric-label">bot Discord</span></div>
    </div>
    <a className="status-card-link" href="#status" onClick={() => trackEvent("operator_status_open", { location: "hero_card" })} data-testid="link-hero-status">Vezi starea completă <Icon name="arrow" size={15} /></a>
  </aside>;
}

function Brand({ footer = false }: { footer?: boolean }) {
  return <a className={`brand ${footer ? "brand--footer" : ""}`} href="#" aria-label="Regatul Cenușii, acasă" data-testid={footer ? "link-footer-brand" : "link-brand"}>
    <span className="brand-mark"><img src={dragonLogo} alt="" /></span><span><strong>REGATUL</strong><small>CENUȘII</small></span>
  </a>;
}

function LandingPage() {
  const health = useOracleHealth();
  const stats = useSoulStoneStats();
  return <div className="landing-page">
    <div className="landing-noise" aria-hidden="true" /><div className="smoke-layer smoke-layer--one" aria-hidden="true" /><div className="smoke-layer smoke-layer--two" aria-hidden="true" />
    <header className="site-nav">
      <Brand />
      <nav className="nav-links" aria-label="Navigație principală"><a href="#lumea" data-testid="link-nav-world">Lumea</a><a href="#facțiuni" data-testid="link-nav-factions">Facțiuni</a><a href="#arena" data-testid="link-nav-arena">Arena</a><a href="#cum-incepi" data-testid="link-nav-start">Inițiere</a></nav>
       <a className="nav-cta" href={DISCORD_INVITE} target="_blank" rel="noopener noreferrer" onClick={() => trackEvent("discord_cta_click", { location: "nav" })} data-testid="link-nav-discord">Intră pe Discord <Icon name="arrow" size={15} /></a>
    </header>

    <main>
      <section className="hero-section">
        <div className="hero-backdrop" aria-hidden="true" /><div className="hero-grid" aria-hidden="true" />
        <div className="hero-content page-width">
          <div className="hero-copy">
            <div className="eyebrow"><span className="eyebrow-line" /> Server Discord RPG · RO</div>
            <h1>Legenda ta<br />începe <em>în Cenușă.</em></h1>
            <p className="hero-lead">Un regat întunecat, viu și fără un final scris. Alege-ți jurământul, înfruntă ceea ce se ascunde în ceață și lasă comunitatea să-ți țină minte numele.</p>
             <div className="hero-actions"><a className="button button--primary" href={DISCORD_INVITE} target="_blank" rel="noopener noreferrer" onClick={() => trackEvent("discord_cta_click", { location: "hero" })} data-testid="link-hero-discord"><span className="button-seal"><Icon name="mark" size={16} /></span> Alătură-te regatului <Icon name="arrow" size={17} /></a><a className="text-link" href="#lumea" data-testid="link-hero-world">Coboară în lume <span>↓</span></a></div>
            <div className="hero-proof"><span className="proof-sigils" aria-hidden="true"><i>V</i><i>S</i><i>F</i></span><span><strong>O comunitate cu memorie</strong><br />fiecare aventură lasă o urmă</span></div>
          </div>
          <div className="hero-aside"><div className="hero-coordinate">45° 18' N<br /><span>Ținuturile de Cenușă</span></div><DragonLogo className="dragon-logo--hero" /><LandingStatusCard health={health} stats={stats} /></div>
        </div>
        <div className="hero-scroll-hint"><span /> Scroll pentru a intra în regat</div>
      </section>

      <LiveRealm health={health} stats={stats} />

      <section className="intro-section page-width" id="lumea">
        <div className="section-heading"><div><div className="eyebrow"><span className="eyebrow-line" /> Harta lumii</div><h2 id="world-heading">Nu este doar un server.<br /><em>Este povestea ta.</em></h2></div><p>Regatul Cenușii este un RPG social în Discord, construit în jurul alegerilor tale. Intră pentru o luptă. Rămâi pentru cronică.</p></div>
         <div className="feature-grid">{realmFeatures.map((feature) => <a className={`feature-card feature-card--${feature.tone}`} href={DISCORD_INVITE} target="_blank" rel="noopener noreferrer" onClick={() => trackEvent("discord_cta_click", { location: `feature_${feature.tone}` })} key={feature.title} data-testid={`link-feature-${feature.tone}`}><span className="feature-number">{feature.number}</span><span className="feature-icon"><Icon name={feature.icon} size={22} /></span><span className="feature-eyebrow">{feature.eyebrow}</span><h3>{feature.title}</h3><p>{feature.body}</p><span className="feature-link">Intră în zonă <Icon name="arrow" size={14} /></span></a>)}</div>
      </section>

      <section className="lore-section">
        <div className="lore-map" aria-hidden="true"><span className="map-line map-line--one" /><span className="map-line map-line--two" /><span className="map-pin map-pin--one" /><span className="map-pin map-pin--two" /><span className="map-label map-label--one">TURNUL GOL</span><span className="map-label map-label--two">MLAȘTINA</span></div>
        <div className="page-width lore-content"><div className="lore-copy"><div className="eyebrow"><span className="eyebrow-line" /> Din cronicile vechi</div><h2>După foc, nu a rămas liniște.<br /><em>A rămas loc.</em></h2><p>Când vechiul regat a ars, cenușa s-a strâns în jurul unei pietre care încă bate. Din ea se ridică drumuri, monștri și jurăminte. Nimeni nu știe cine a aprins primul foc. Toți pot decide cine îl stinge.</p><span className="lore-signature">FRAGMENTUL 07 · ARHIVA REGALĂ</span></div><div className="lore-aside"><AshCore /><div className="lore-aside-label">Miezul încă veghează</div></div></div>
      </section>

      <section className="factions-section page-width" id="facțiuni">
        <div className="section-heading"><div><div className="eyebrow"><span className="eyebrow-line" /> Trei jurăminte</div><h2>Nu alegi o clasă.<br /><em>Alegi un ecou.</em></h2></div><p>Facțiunile nu sunt cuști. Sunt felul în care lumea începe să te recunoască.</p></div>
         <div className="factions-list">{factions.map((faction, index) => <a href={DISCORD_INVITE} target="_blank" rel="noopener noreferrer" className={`faction-row faction-row--${faction.color}`} onClick={() => trackEvent("discord_cta_click", { location: `faction_${faction.color}` })} key={faction.name} data-testid={`link-faction-${index}`}><span className="faction-mark">{faction.mark}</span><span className="faction-copy"><span className="faction-detail">{faction.detail}</span><strong>{faction.name}</strong><p>{faction.copy}</p></span><span className="faction-enter"><Icon name="arrow" size={19} /></span></a>)}</div>
      </section>

      <section className="quote-section"><div className="quote-orbit" aria-hidden="true" /><div className="page-width quote-inner"><span className="quote-mark">“</span><blockquote>În Cenușă nu contează de unde ai venit.<br /><em>Contează ce alegi să devii.</em></blockquote><span className="quote-rule" /><span className="quote-attribution">— Cronica Regatului · anul fără soare</span></div></section>

      <section className="hall-section page-width" id="hall-of-fame">
         <div className="hall-intro"><div className="eyebrow"><span className="eyebrow-line" /> Sala numelor</div><h2>Cei care au lăsat<br /><em>urme în piatră.</em></h2><p>O galerie pentru aventurierii care au dus povestea mai departe. Următorul portret poate fi al tău.</p><a className="quiet-link" href={DISCORD_INVITE} target="_blank" rel="noopener noreferrer" onClick={() => trackEvent("discord_cta_click", { location: "hall_of_fame" })} data-testid="link-hall-discord">Scrie-ți numele în cronică <Icon name="arrow" size={17} /></a></div>
        <div className="champions">{champions.map((champion) => <div className={`champion champion--${champion.tone}`} key={champion.name}><span className="champion-rank">{champion.rank}</span><span className="champion-avatar">{champion.name.slice(0, 1)}</span><span className="champion-copy"><strong>{champion.name}</strong><small>{champion.title}</small></span><span className="champion-score">{champion.score}</span></div>)}</div>
      </section>

      <section className="arena-section" id="arena"><div className="page-width arena-layout"><div className="arena-heading"><div className="eyebrow"><span className="eyebrow-line" /> Calendarul porții</div><h2>Focul se vede<br /><em>cel mai bine în arenă.</em></h2><p>Evenimentele comunității sunt locul unde planurile devin povești pe care le repeți la tavernă.</p><a className="button button--outline" href={DISCORD_INVITE} target="_blank" rel="noopener noreferrer" onClick={() => trackEvent("discord_cta_click", { location: "arena" })} data-testid="link-arena-discord">Vezi anunțurile pe Discord <Icon name="arrow" size={16} /></a></div><div className="event-list">{events.map((event, index) => <a className="event-row" href={DISCORD_INVITE} target="_blank" rel="noopener noreferrer" onClick={() => trackEvent("discord_cta_click", { location: `event_${index + 1}` })} key={event.name} data-testid={`link-event-${index}`}><span className="event-date">{event.date}</span><span className="event-name"><strong>{event.name}</strong><small>{event.copy}</small></span><span className="event-status">{event.status}</span><Icon name="arrow" size={17} /></a>)}</div></div></section>

      <section className="tavern-section page-width"><div className="tavern-card"><div className="tavern-ornament" aria-hidden="true"><Icon name="flame" size={29} /></div><div><div className="eyebrow"><span className="eyebrow-line" /> La hanul de la hotar</div><h2>Locul în care eroii<br /><em>lasă armura jos.</em></h2><p>O comunitate activă, conversații târzii, meme-uri fără praf și oameni care te ajută să-ți găsești primul drum.</p></div><a className="button button--ghost" href={DISCORD_INVITE} target="_blank" rel="noopener noreferrer" onClick={() => trackEvent("discord_cta_click", { location: "tavern" })} data-testid="link-tavern-discord">Deschide ușa <Icon name="arrow" size={16} /></a></div></section>

      <section className="journey-section page-width" id="cum-incepi"><div className="section-heading section-heading--center"><div><div className="eyebrow"><span className="eyebrow-line" /> Ritualul de inițiere</div><h2>Intră. <em>Alege.</em> Evoluează.</h2></div><p>Nu ai nevoie de experiență. Doar de curajul de a deschide poarta.</p></div><div className="journey-grid"><div className="journey-step"><span className="step-icon">01</span><div><h3>Deschide poarta</h3><p>Intră pe serverul Discord, citește regulile și primește-ți locul în Regat.</p></div></div><div className="journey-connector"><Icon name="arrow" size={22} /></div><div className="journey-step"><span className="step-icon">02</span><div><h3>Alege-ți ecoul</h3><p>Descoperă facțiunile, clasele și companionul care ți se potrivesc.</p></div></div><div className="journey-connector"><Icon name="arrow" size={22} /></div><div className="journey-step"><span className="step-icon">03</span><div><h3>Lasă o urmă</h3><p>Luptă în evenimente, ajută un nou venit și scrie următorul capitol.</p></div></div></div></section>

      <section className="cta-section page-width"><div className="cta-card"><div className="cta-glow" aria-hidden="true" /><div className="cta-copy"><div className="eyebrow"><span className="eyebrow-line" /> Poarta este deschisă</div><h2>Locul tău în Regat<br /><em>te așteaptă.</em></h2><p>Nu trebuie să vii pregătit. Trebuie doar să vii.</p><a className="button button--primary" href={DISCORD_INVITE} target="_blank" rel="noopener noreferrer" onClick={() => trackEvent("discord_cta_click", { location: "final_cta" })} data-testid="link-final-discord">Intră pe Discord <Icon name="arrow" size={17} /></a></div><div className="cta-sigil"><Icon name="crown" size={43} /><span>RC</span></div><DragonLogo className="dragon-logo--cta" /></div></section>
    </main>

    <footer className="site-footer page-width"><div className="footer-top"><Brand footer /><span className="footer-motto">O lume creată pentru cei care aleg să lupte.</span><a href={DISCORD_INVITE} target="_blank" rel="noopener noreferrer" onClick={() => trackEvent("discord_cta_click", { location: "footer" })} data-testid="link-footer-discord">discord.gg/JNYsGeMhzm <Icon name="arrow" size={14} /></a></div><div className="footer-bottom"><span>REGATUL CENUȘII · O CRONICĂ VIE</span><a href="#status" onClick={() => trackEvent("operator_status_open", { location: "footer" })} data-testid="link-footer-status"><StatusDot active={health?.botOnline ?? false} /> operator / stare live</a><span>© 2024 — fără tron, doar povești</span></div></footer>
  </div>;
}

function OperatorHealthPage() {
  const health = useOracleHealth();
  const botTone = health === null ? "loading" : health.botOnline ? "ok" : "danger";
  const botLabel = health === null ? "Se verifică…" : health.botOnline ? "Online" : "Offline";
  let replyTone: "loading" | "ok" | "warn" | "danger";
  let replyLabel: string;
  let replyDetail: string;
  if (health === null) { replyTone = "loading"; replyLabel = "Se verifică…"; replyDetail = "Se interoghează /api/healthz."; }
  else if (health.oracleReplyMode === "full") { replyTone = "ok"; replyLabel = "Complet (active)"; replyDetail = "Răspunde la fiecare reply, mențiune și ping."; }
  else if (health.oracleReplyReason === "portal_toggle_missing") { replyTone = "danger"; replyLabel = "Redus (portal_toggle_missing)"; replyDetail = "Comutatorul „Message Content” lipsește din Developer Portal. Activează-l, apoi repornește botul."; }
  else { replyTone = "warn"; replyLabel = "Redus (disabled)"; replyDetail = "Răspunsul la toate reply-urile este dezactivat din configurare."; }
  const { tone: alertTone, label: alertLabel, detail: alertDetail } = computeAlertCard(health);
  return <div className="ops-page"><div className="ops-panel"><header className="ops-head"><a className="ops-back" href="#">← Înapoi la pagina principală</a><h1 className="ops-title"><Icon name="mark" size={22} /> Starea operatorului</h1><p className="ops-sub">{health === null ? "Nu se poate contacta /api/healthz." : "Date live · reîmprospătare la 15 secunde"}</p></header><div className="ops-grid"><div className={`ops-card ops-card--${botTone}`}><span className="ops-card-label">Bot Discord</span><span className="ops-card-value"><span className="ops-dot" />{botLabel}</span></div><div className="ops-card"><span className="ops-card-label">Shard</span><span className="ops-card-value">{health?.shardStatus ?? "—"}</span></div><div className="ops-card"><span className="ops-card-label">Uptime bot</span><span className="ops-card-value">{health ? formatUptime(health.botUptime) : "…"}</span></div><div className={`ops-card ops-card--${replyTone}`}><span className="ops-card-label">Mod răspuns</span><span className="ops-card-value"><span className="ops-dot" />{replyLabel}</span><span className="ops-card-detail">{replyDetail}</span></div><div className={`ops-card ops-card--${alertTone}`}><span className="ops-card-label">Alerte push</span><span className="ops-card-value"><span className="ops-dot" />{alertLabel}</span><span className="ops-card-detail">{alertDetail}</span></div></div><footer className="ops-foot"><a href={`${API_BASE}/api/healthz`} target="_blank" rel="noopener noreferrer">Vezi JSON brut</a><a href="#">Pagina principală →</a></footer></div></div>;
}

export default function App() {
  const hash = window.location.hash;
  if (hash === "#ops" || hash === "#status") return <OperatorHealthPage />;
  return <LandingPage />;
}