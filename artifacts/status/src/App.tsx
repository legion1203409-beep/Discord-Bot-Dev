import { useState, useEffect, useCallback, useRef } from "react";
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

type Zone = (typeof zones)[number];

function MapPage() {
  const [activeZone, setActiveZone] = useState<string | null>(null);
  const [zoomTarget, setZoomTarget] = useState<Zone | null>(null);
  const stats = useSoulStoneStats();
  const zoomingRef = useRef(false);
  const timersRef = useRef<number[]>([]);

  useEffect(() => {
    const timers = timersRef.current;
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, []);

  function handleZoneClick(e: React.MouseEvent, zone: Zone) {
    e.preventDefault();
    if (zoomingRef.current) return;
    zoomingRef.current = true;
    setActiveZone(null);
    setZoomTarget(zone);

    // Open the tab now (preserves the user gesture, avoids popup blocking),
    // then navigate it to Discord once the zoom-in has played.
    const newTab = window.open("about:blank", "_blank");
    if (newTab) newTab.opener = null;

    const openTimer = window.setTimeout(() => {
      if (newTab && !newTab.closed) {
        newTab.location.href = zone.href;
      } else {
        // Popup was blocked — fall back to navigating the current tab.
        window.location.href = zone.href;
      }
    }, 1100);

    const resetTimer = window.setTimeout(() => {
      setZoomTarget(null);
      zoomingRef.current = false;
    }, 2200);

    timersRef.current.push(openTimer, resetTimer);
  }

  const zooming = zoomTarget !== null;

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
          <p className="map-subtitle">
            {zooming ? `Intri în ${zoomTarget?.name}…` : "Cinci domenii, o singură legendă"}
          </p>
        </div>

        {/* Fantasy map */}
        <div className="fantasy-map">
          <div className={`fantasy-map-frame ${zooming ? "fantasy-map-frame--zooming" : ""}`}>

            {/* Background that zooms toward the clicked zone */}
            <div
              className="map-bg-img"
              style={
                zooming
                  ? {
                      transform: "scale(3.6)",
                      transformOrigin: `${zoomTarget?.mapX} ${zoomTarget?.mapY}`,
                    }
                  : undefined
              }
            />

            {/* Decorative corner ornaments */}
            <span className="map-corner map-corner--tl">✦</span>
            <span className="map-corner map-corner--tr">✦</span>
            <span className="map-corner map-corner--bl">✦</span>
            <span className="map-corner map-corner--br">✦</span>

            {/* SVG paths between zones */}
            <svg
              className={`map-paths ${zooming ? "map-faded" : ""}`}
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
            >
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
                className={`map-marker ${activeZone === zone.id ? "map-marker--active" : ""} ${zooming ? "map-faded" : ""}`}
                style={{
                  left: zone.mapX,
                  top: zone.mapY,
                  "--zone-color": zone.color,
                  "--zone-glow": zone.glow,
                } as React.CSSProperties}
                onMouseEnter={() => !zooming && setActiveZone(zone.id)}
                onMouseLeave={() => setActiveZone(null)}
                onClick={(e) => handleZoneClick(e, zone)}
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
              className={`map-soul-widget ${zooming ? "map-faded" : ""}`}
              onMouseEnter={() => !zooming && setActiveZone("soul")}
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

            {/* Zoom title overlay */}
            {zooming && (
              <div className="map-zoom-label">
                <span className="map-zoom-icon">{zoomTarget?.icon}</span>
                <span className="map-zoom-name">{zoomTarget?.name}</span>
              </div>
            )}

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

const EMBERS = Array.from({ length: 26 }, (_, i) => ({
  id: i,
  left: Math.random() * 100,
  delay: Math.random() * 8,
  duration: 6 + Math.random() * 7,
  size: 2 + Math.random() * 4,
  drift: (Math.random() - 0.5) * 120,
}));

function GatePage({ onEnter }: { onEnter: () => void }) {
  const [opening, setOpening] = useState(false);

  function handleEnter() {
    if (opening) return;
    setOpening(true);
    setTimeout(onEnter, 1100);
  }

  return (
    <div className={`gate-page ${opening ? "gate-page--opening" : ""}`}>
      {/* Gate image */}
      <div className="gate-img-wrap">
        <img src="/gate.png" alt="Poarta Regatului Cenușii" className="gate-img" />
        <div className="gate-img-vignette" />
      </div>

      {/* Smoke layers */}
      <div className="smoke smoke-1" />
      <div className="smoke smoke-2" />
      <div className="smoke smoke-3" />
      <div className="smoke smoke-4" />

      {/* Floating embers */}
      <div className="embers">
        {EMBERS.map((e) => (
          <span
            key={e.id}
            className="ember"
            style={{
              left: `${e.left}%`,
              width: `${e.size}px`,
              height: `${e.size}px`,
              animationDelay: `${e.delay}s`,
              animationDuration: `${e.duration}s`,
              "--drift": `${e.drift}px`,
            } as React.CSSProperties}
          />
        ))}
      </div>

      {/* Light flash on open */}
      <div className={`gate-flash ${opening ? "gate-flash--active" : ""}`} />

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
        <span className="gate-scroll-hint">▾</span>
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
