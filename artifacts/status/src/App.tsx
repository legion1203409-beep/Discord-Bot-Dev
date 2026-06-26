import { useState, useEffect, useCallback } from "react";
import "./index.css";

const DISCORD_INVITE = "https://discord.gg/JNYsGeMhzm";
const API_BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

const zones = [
  {
    id: "taverna",
    icon: "🍺",
    name: "Taverna Umbrelor",
    desc: "Locul unde aventurierii se odihnesc, povestesc și pun la cale planuri.",
    color: "#8b0000",
    glow: "rgba(139,0,0,0.45)",
    mapX: "18%",
    mapY: "62%",
    href: "https://discord.gg/JNYsGeMhzm",
  },
  {
    id: "arena",
    icon: "⚔️",
    name: "Arena Sângelui Rece",
    desc: "Luptele fără milă din Ora Umbrelor. Câștigă glorie sau cazi în uitare.",
    color: "#c0392b",
    glow: "rgba(192,57,43,0.45)",
    mapX: "75%",
    mapY: "28%",
    href: "https://discord.gg/JNYsGeMhzm",
  },
  {
    id: "forja",
    icon: "🔨",
    name: "Forja Culorilor",
    desc: "Îmbunătățește-ți armura, arma și abilitățile. Fiecare oboli investit contează.",
    color: "#b8860b",
    glow: "rgba(184,134,11,0.45)",
    mapX: "55%",
    mapY: "68%",
    href: "https://discord.gg/JNYsGeMhzm",
  },
  {
    id: "arhive",
    icon: "📜",
    name: "Arhivele Cenușii",
    desc: "Legile regatului, istoria sa și regulile care guvernează destinele locuitorilor.",
    color: "#4a6fa5",
    glow: "rgba(74,111,165,0.45)",
    mapX: "30%",
    mapY: "22%",
    href: "https://discord.gg/JNYsGeMhzm",
  },
  {
    id: "turnul",
    icon: "🗼",
    name: "Turnul Gardienilor",
    desc: "Gardienii veghează ordinea. Raportează, propune, contribuie.",
    color: "#2e7d32",
    glow: "rgba(46,125,50,0.45)",
    mapX: "80%",
    mapY: "72%",
    href: "https://discord.gg/JNYsGeMhzm",
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
    const id = setInterval(() => void fetchStats(), 10_000);
    return () => clearInterval(id);
  }, [fetchStats]);

  return stats;
}

function MapPage() {
  const [activeZone, setActiveZone] = useState<string | null>(null);
  const stats = useSoulStoneStats();

  return (
    <div className="map-page">
      <div className="map-bg" />

      <header className="map-header">
        <div className="map-header-inner">
          <span className="map-logo">🏰 REGATUL CENUȘII</span>
          <a href={DISCORD_INVITE} target="_blank" rel="noopener noreferrer" className="map-join-btn">
            ⚔️ Alătură-te
          </a>
        </div>
      </header>

      <main className="map-main">
        <div className="map-title-block">
          <h2 className="map-title">Harta Regatului</h2>
          <p className="map-subtitle">Cinci domenii, o singură legendă</p>
        </div>

        {/* Fantasy map */}
        <div className="fantasy-map">
          <div className="fantasy-map-frame">

            {/* Decorative corner ornaments */}
            <span className="map-corner map-corner--tl">✦</span>
            <span className="map-corner map-corner--tr">✦</span>
            <span className="map-corner map-corner--bl">✦</span>
            <span className="map-corner map-corner--br">✦</span>

            {/* SVG paths between zones */}
            <svg className="map-paths" viewBox="0 0 100 100" preserveAspectRatio="none">
              <path d="M18,62 Q35,45 30,22" className="map-path" />
              <path d="M30,22 Q52,25 75,28" className="map-path" />
              <path d="M18,62 Q36,65 55,68" className="map-path" />
              <path d="M55,68 Q67,68 80,72" className="map-path" />
              <path d="M75,28 Q78,50 80,72" className="map-path" />
              <path d="M30,22 Q42,44 55,68" className="map-path map-path--dim" />
            </svg>

            {/* Zone markers */}
            {zones.map((zone) => (
              <a
                key={zone.id}
                href={zone.href}
                target="_blank"
                rel="noopener noreferrer"
                className={`map-marker ${activeZone === zone.id ? "map-marker--active" : ""}`}
                style={{
                  left: zone.mapX,
                  top: zone.mapY,
                  "--zone-color": zone.color,
                  "--zone-glow": zone.glow,
                } as React.CSSProperties}
                onMouseEnter={() => setActiveZone(zone.id)}
                onMouseLeave={() => setActiveZone(null)}
              >
                <div className="map-marker-pin">
                  <span className="map-marker-icon">{zone.icon}</span>
                  <div className="map-marker-pulse" />
                </div>
                <div className="map-marker-tooltip">
                  <strong>{zone.name}</strong>
                  <span>{zone.desc}</span>
                </div>
              </a>
            ))}

            {/* Soul Stone widget — center of map */}
            <div
              className="map-soul-widget"
              onMouseEnter={() => setActiveZone("soul")}
              onMouseLeave={() => setActiveZone(null)}
            >
              <div className="map-soul-orb">🔮</div>
              <div className="map-soul-label">Piatra de Suflete</div>
              <div className="map-soul-stats">
                <span title="Suflete treze" className="map-soul-online">
                  {stats !== null && stats.onlineCount !== null && (
                    <span className="map-soul-online-dot" />
                  )}
                  ✨ {stats === null ? "…" : stats.onlineCount !== null ? stats.onlineCount : "—"}
                </span>
                <span title="Locuitori">
                  👥 {stats === null ? "…" : stats.totalMembers !== null ? stats.totalMembers : "—"}
                </span>
              </div>
              {stats !== null && (
                <span className={`map-soul-live ${stats.live ? "" : "map-soul-live--off"}`}>
                  {stats.live ? "● live" : "● offline"}
                </span>
              )}
            </div>

          </div>
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

      {/* Gate image */}
      <div className="gate-img-wrap">
        <img src="/gate.png" alt="Poarta Regatului Cenușii" className="gate-img" />
        <div className="gate-img-vignette" />
      </div>

      {/* Overlay content */}
      <div className="gate-overlay">
        <h1 className="gate-title">🏰 REGATUL CENUȘII</h1>
        <p className="gate-sub">Aici începe legenda ta.</p>
        <button
          className={`gate-btn ${opening ? "gate-btn--opening" : ""}`}
          onClick={handleEnter}
          disabled={opening}
        >
          ⚔️ INTRĂ ÎN REGAT
        </button>
      </div>
    </div>
  );
}

export default function App() {
  const [entered, setEntered] = useState(false);

  return entered
    ? <MapPage />
    : <GatePage onEnter={() => setEntered(true)} />;
}
