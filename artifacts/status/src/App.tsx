import { useState, useEffect, useCallback } from "react";
import "./index.css";

const DISCORD_INVITE = "https://discord.gg/JNYsGeMhzm";
const API_BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

const zones = [
  {
    id: "taverna",
    icon: "🍺",
    name: "Taverna Umbrelor",
    desc: "Locul unde aventurierii se odihnesc, povestesc și pun la cale planuri în umbra lumânărilor.",
    color: "#8b0000",
    glow: "rgba(139,0,0,0.35)",
  },
  {
    id: "arena",
    icon: "⚔️",
    name: "Arena Sângelui Rece",
    desc: "Luptele fără milă din Ora Umbrelor. Câștigă glorie sau cazi în uitare.",
    color: "#c0392b",
    glow: "rgba(192,57,43,0.35)",
  },
  {
    id: "forja",
    icon: "🔨",
    name: "Forja Culorilor",
    desc: "Îmbunătățește-ți armura, arma și abilitățile. Fiecare oboli investit contează.",
    color: "#b8860b",
    glow: "rgba(184,134,11,0.35)",
  },
  {
    id: "arhive",
    icon: "📜",
    name: "Arhivele Cenușii",
    desc: "Legile regatului, istoria sa și regulile care guvernează destinele locuitorilor.",
    color: "#4a6fa5",
    glow: "rgba(74,111,165,0.35)",
  },
  {
    id: "turnul",
    icon: "🗼",
    name: "Turnul Gardienilor",
    desc: "Gardienii veghează ordinea. Raportează, propune, contribuie la bunul mers al regatului.",
    color: "#2e7d32",
    glow: "rgba(46,125,50,0.35)",
  },
];

interface DiscordStats {
  live: boolean;
  onlineCount: number | null;
  totalMembers: number | null;
  lastJoined: string | null;
}

function useSoulStoneStats() {
  const [stats, setStats] = useState<DiscordStats | null>(null);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/discord/stats`);
      if (!res.ok) throw new Error("bad response");
      const data: DiscordStats = await res.json();
      setStats(data);
    } catch {
      setStats({ live: false, onlineCount: null, totalMembers: null, lastJoined: null });
    }
  }, []);

  useEffect(() => {
    void fetchStats();
    const id = setInterval(() => void fetchStats(), 30_000);
    return () => clearInterval(id);
  }, [fetchStats]);

  return stats;
}

function SoulStoneWidget() {
  const stats = useSoulStoneStats();

  return (
    <div className="zone-card zone-card--soul">
      <div className="zone-soul-orb">
        <span className="zone-soul-orb-inner">🔮</span>
      </div>
      <h3 className="zone-name zone-name--soul">Piatra de Suflete</h3>
      <p className="zone-desc">Oglinda vie a Regatului. Suflete treze, locuitori și ultimul sosit.</p>

      <div className="soul-stats">
        <div className="soul-stat">
          <span className="soul-stat-icon">✨</span>
          <span className="soul-stat-label">Suflete treze</span>
          <span className="soul-stat-value">
            {stats === null ? "…" : stats.onlineCount !== null ? stats.onlineCount : "—"}
          </span>
        </div>
        <div className="soul-stat">
          <span className="soul-stat-icon">👥</span>
          <span className="soul-stat-label">Locuitori</span>
          <span className="soul-stat-value">
            {stats === null ? "…" : stats.totalMembers !== null ? stats.totalMembers : "—"}
          </span>
        </div>
        <div className="soul-stat soul-stat--full">
          <span className="soul-stat-icon">🕯️</span>
          <span className="soul-stat-label">Ultimul sosit</span>
          <span className="soul-stat-value soul-stat-value--name">
            {stats === null ? "…" : stats.lastJoined ?? "—"}
          </span>
        </div>
      </div>

      {stats !== null && (
        <p className="soul-live-badge">
          {stats.live
            ? <><span className="soul-live-dot" />Date live</>
            : <><span className="soul-live-dot soul-live-dot--off" />Bot offline</>
          }
        </p>
      )}
    </div>
  );
}

function MapPage() {
  const [bannerVisible, setBannerVisible] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setBannerVisible(true), 100);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="map-page">
      <div className="map-bg" />

      {/* Cinematic banner */}
      <div className={`map-banner ${bannerVisible ? "map-banner--visible" : ""}`}>
        <p className="map-banner-text">
          Bine ai pășit în Regatul Cenușii.<br />
          <em>Alege-ți drumul, călătorule.</em>
        </p>
      </div>

      <header className="map-header">
        <div className="map-header-inner">
          <span className="map-logo">🏰 REGATUL CENUȘII</span>
          <a
            href={DISCORD_INVITE}
            target="_blank"
            rel="noopener noreferrer"
            className="map-join-btn"
          >
            ⚔️ Alătură-te
          </a>
        </div>
      </header>

      <main className="map-main">
        <h2 className="map-title">Harta Regatului</h2>
        <p className="map-subtitle">Cinci domenii, o singură legendă</p>

        <div className="zones-grid">
          {zones.map((zone) => (
            <a
              key={zone.id}
              href={DISCORD_INVITE}
              target="_blank"
              rel="noopener noreferrer"
              className="zone-card zone-card--link"
              style={{ "--zone-color": zone.color, "--zone-glow": zone.glow } as React.CSSProperties}
            >
              <div className="zone-icon">{zone.icon}</div>
              <h3 className="zone-name">{zone.name}</h3>
              <p className="zone-desc">{zone.desc}</p>
            </a>
          ))}

          <SoulStoneWidget />
        </div>

        <footer className="map-footer">
          © 2026 Regatul Cenușii · Oracolul Cenușii#5028 ·{" "}
          <a href={DISCORD_INVITE} target="_blank" rel="noopener noreferrer">
            discord.gg/JNYsGeMhzm
          </a>
        </footer>
      </main>
    </div>
  );
}

function GatePage({ onEnter }: { onEnter: () => void }) {
  const [opening, setOpening] = useState(false);

  function handleEnter() {
    if (opening) return;
    setOpening(true);
    setTimeout(onEnter, 1100);
  }

  return (
    <div className={`gate-page ${opening ? "gate-page--opening" : ""}`}>
      {/* Smoke layers */}
      <div className="smoke smoke-1" />
      <div className="smoke smoke-2" />
      <div className="smoke smoke-3" />
      <div className="smoke smoke-4" />

      {/* Light flash on open */}
      <div className={`gate-flash ${opening ? "gate-flash--active" : ""}`} />

      {/* Gate SVG */}
      <div className="gate-wrap">
        <svg
          className="gate-svg"
          viewBox="0 0 240 300"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          {/* Gate pillars */}
          <rect x="10" y="60" width="28" height="240" rx="4" fill="#1a1a2e" stroke="#2a2a4a" strokeWidth="1.5" />
          <rect x="202" y="60" width="28" height="240" rx="4" fill="#1a1a2e" stroke="#2a2a4a" strokeWidth="1.5" />

          {/* Gate arch */}
          <path
            d="M38 150 Q38 40 120 40 Q202 40 202 150"
            stroke="#2a2a4a"
            strokeWidth="2"
            fill="#0d0d1a"
          />

          {/* Gate doors */}
          <rect x="38" y="150" width="82" height="150" fill="#111122" stroke="#2a2a4a" strokeWidth="1" />
          <rect x="120" y="150" width="82" height="150" fill="#111122" stroke="#2a2a4a" strokeWidth="1" />

          {/* Door planks */}
          {[160, 185, 210, 235, 260, 285].map((y) => (
            <g key={y}>
              <line x1="40" y1={y} x2="118" y2={y} stroke="#1a1a30" strokeWidth="1" />
              <line x1="122" y1={y} x2="200" y2={y} stroke="#1a1a30" strokeWidth="1" />
            </g>
          ))}

          {/* Door handles */}
          <circle cx="116" cy="225" r="5" fill="#2a2a4a" />
          <circle cx="124" cy="225" r="5" fill="#2a2a4a" />

          {/* Runes on pillars */}
          {[80, 110, 140, 170].map((y, i) => (
            <g key={y} className={`gate-rune gate-rune-${i}`}>
              <rect x="17" y={y} width="14" height="14" rx="2" fill="none" stroke="#5865F2" strokeWidth="1.2" opacity="0.7" />
              <text x="24" y={y + 10} textAnchor="middle" fill="#5865F2" fontSize="8" opacity="0.8">
                {["ᚱ", "ᚢ", "ᚾ", "ᚨ"][i]}
              </text>
            </g>
          ))}
          {[80, 110, 140, 170].map((y, i) => (
            <g key={`r-${y}`} className={`gate-rune gate-rune-${i}`}>
              <rect x="209" y={y} width="14" height="14" rx="2" fill="none" stroke="#5865F2" strokeWidth="1.2" opacity="0.7" />
              <text x="216" y={y + 10} textAnchor="middle" fill="#5865F2" fontSize="8" opacity="0.8">
                {["ᛖ", "ᚷ", "ᚨ", "ᛚ"][i]}
              </text>
            </g>
          ))}

          {/* Arch keystone rune */}
          <g className="gate-rune gate-rune-key">
            <circle cx="120" cy="44" r="14" fill="#0d0d1a" stroke="#5865F2" strokeWidth="1.5" opacity="0.85" />
            <text x="120" y="49" textAnchor="middle" fill="#5865F2" fontSize="12" opacity="0.9">ᚱ</text>
          </g>

          {/* Torches */}
          <g className="gate-torch gate-torch-left">
            <rect x="3" y="55" width="6" height="10" rx="1" fill="#3a2a1a" />
            <ellipse cx="6" cy="52" rx="5" ry="8" fill="url(#flame-l)" opacity="0.9" />
          </g>
          <g className="gate-torch gate-torch-right">
            <rect x="231" y="55" width="6" height="10" rx="1" fill="#3a2a1a" />
            <ellipse cx="234" cy="52" rx="5" ry="8" fill="url(#flame-r)" opacity="0.9" />
          </g>

          <defs>
            <radialGradient id="flame-l" cx="50%" cy="70%">
              <stop offset="0%" stopColor="#ffd700" />
              <stop offset="60%" stopColor="#c0392b" />
              <stop offset="100%" stopColor="transparent" />
            </radialGradient>
            <radialGradient id="flame-r" cx="50%" cy="70%">
              <stop offset="0%" stopColor="#ffd700" />
              <stop offset="60%" stopColor="#c0392b" />
              <stop offset="100%" stopColor="transparent" />
            </radialGradient>
          </defs>
        </svg>
      </div>

      {/* Title */}
      <h1 className="gate-title">🏰 REGATUL CENUȘII</h1>
      <p className="gate-sub">Aici începe legenda ta.</p>

      {/* Enter button */}
      <button
        className={`gate-btn ${opening ? "gate-btn--opening" : ""}`}
        onClick={handleEnter}
        disabled={opening}
      >
        ⚔️ INTRĂ ÎN REGAT
      </button>
    </div>
  );
}

export default function App() {
  const [entered, setEntered] = useState(false);

  return entered
    ? <MapPage />
    : <GatePage onEnter={() => setEntered(true)} />;
}
