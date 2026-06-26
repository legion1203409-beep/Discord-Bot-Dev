import { useQuery } from "@tanstack/react-query";
import { getHealthCheckQueryOptions } from "@workspace/api-client-react";
import "./index.css";

const DISCORD_INVITE = "https://discord.gg/JNYsGeMhzm";

const features = [
  { icon: "⚔", title: "Lupte & Evenimente", desc: "Înfruntă monștri și jucători în Ora Umbrelor. Câștigă oboli și glorie." },
  { icon: "🪙", title: "Economie cu Oboli", desc: "Câștigă moneda regatului prin lupte, cufere și misiuni. Cheltuiește-o înțelept." },
  { icon: "🐺", title: "Tovarăși", desc: "Recrutează și evoluează tovarăși unici care luptă alături de tine." },
  { icon: "⚡", title: "Abilități Speciale", desc: "Deblochează Lovitura Umbrei și Scutul de Cenușă — îmbunătățește-le cu XP." },
  { icon: "📦", title: "Cufere cu Comori", desc: "Cufere de lemn, argint, aur și mitic apar aleator. Fii primul care le revendică." },
  { icon: "🔮", title: "Oracolul Cenușii", desc: "Botul magic gestionează lupte, economie și lumea jocului — automat, non-stop." },
];

const companions = [
  { name: "Lupul de Cenușă", icon: "🐺", bonus: "+2 damage" },
  { name: "Corbul Umbrelor", icon: "🐦‍⬛", bonus: "+3% critic" },
  { name: "Spiritul Stins", icon: "👻", bonus: "+5 HP" },
  { name: "Golem de Fum", icon: "🗿", bonus: "-1 dmg primit" },
];

function formatDuration(seconds: number): string {
  if (seconds === 0) return "—";
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (d > 0) return `${d}z ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function formatLastSeen(isoString: string | null): string {
  if (!isoString) return "Niciodată";
  const date = new Date(isoString);
  return date.toLocaleString("ro-RO", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function shardLabel(status: string | null): string {
  switch (status) {
    case "ready": return "Conectat";
    case "reconnecting": return "Reconectare…";
    case "disconnected": return "Deconectat";
    case "fatal_disconnect": return "Eroare fatală";
    case "disconnected": return "Deconectat";
    default: return status ?? "Necunoscut";
  }
}

function BotStatus() {
  const { data, isLoading, isError } = useQuery({
    ...getHealthCheckQueryOptions(),
    refetchInterval: 15_000,
  });

  if (isLoading) {
    return (
      <div className="bot-status-card bot-status-loading">
        <div className="bot-status-indicator bot-status-indicator--pulse" />
        <span className="bot-status-text">Se încarcă…</span>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="bot-status-card bot-status-offline">
        <div className="bot-status-indicator bot-status-indicator--offline" />
        <span className="bot-status-text">Server API indisponibil</span>
      </div>
    );
  }

  const online = data.botOnline;

  return (
    <div className={`bot-status-card ${online ? "bot-status-online" : "bot-status-offline"}`}>
      <div className="bot-status-header">
        <div className={`bot-status-indicator ${online ? "bot-status-indicator--online" : "bot-status-indicator--offline"}`} />
        <span className="bot-status-badge">{online ? "Online" : "Offline"}</span>
        <span className="bot-status-name">Oracolul Cenușii</span>
      </div>
      <div className="bot-status-grid">
        <div className="bot-status-item">
          <span className="bot-status-label">Uptime bot</span>
          <span className="bot-status-value">{online ? formatDuration(data.botUptime) : "—"}</span>
        </div>
        <div className="bot-status-item">
          <span className="bot-status-label">Ultima conectare</span>
          <span className="bot-status-value">{formatLastSeen(data.botReadyAt)}</span>
        </div>
        <div className="bot-status-item">
          <span className="bot-status-label">Stare shard</span>
          <span className={`bot-status-value bot-status-shard ${online ? "bot-status-shard--ok" : "bot-status-shard--err"}`}>
            {shardLabel(data.shardStatus)}
          </span>
        </div>
      </div>
      <p className="bot-status-refresh">Actualizat automat la fiecare 15 secunde</p>
    </div>
  );
}

export default function App() {
  return (
    <div className="site-root">
      {/* NAV */}
      <nav className="nav">
        <span className="nav-logo">⚰ Regatul Cenușii</span>
        <div className="nav-links">
          <a href="#status">Status</a>
          <a href="#sisteme">Sisteme</a>
          <a href="#tovarasi">Tovarăși</a>
          <a href={DISCORD_INVITE} target="_blank" rel="noopener noreferrer" className="btn-discord-sm">
            Alătură-te pe Discord
          </a>
        </div>
      </nav>

      {/* HERO */}
      <section className="hero">
        <div className="hero-dots" />
        <p className="hero-eyebrow">⚔ Server Discord RPG · Comunitate Românească</p>
        <h1 className="hero-title">
          Regatul<br /><span className="hero-title-red">Cenușii</span>
        </h1>
        <p className="hero-sub">
          Intră în lumea <em>Orei Umbrelor</em> — un RPG de supraviețuire pe Discord unde fiecare alegere contează.
        </p>
        <div className="hero-btns">
          <a href={DISCORD_INVITE} target="_blank" rel="noopener noreferrer" className="btn-primary">
            🎮 Intră pe Server
          </a>
          <a href="#sisteme" className="btn-secondary">Află mai mult</a>
        </div>
        <div className="hero-stats">
          {[["500+", "Jucători"], ["1000+", "Lupte"], ["50+", "Evenimente"]].map(([n, l]) => (
            <div key={l} className="stat">
              <div className="stat-num">{n}</div>
              <div className="stat-label">{l}</div>
            </div>
          ))}
        </div>
      </section>

      {/* BOT STATUS */}
      <section id="status" className="section-status">
        <div className="section-status-inner">
          <h2 className="section-title">Status Bot</h2>
          <p className="section-sub">Starea în timp real a Oracolului Cenușii</p>
          <BotStatus />
        </div>
      </section>

      {/* FEATURES */}
      <section id="sisteme" className="section">
        <h2 className="section-title">Sistemele Jocului</h2>
        <p className="section-sub">Tot ce ai nevoie pentru a supraviețui în Regatul Cenușii</p>
        <div className="features-grid">
          {features.map(({ icon, title, desc }) => (
            <div key={title} className="feature-card">
              <div className="feature-icon">{icon}</div>
              <h3 className="feature-title">{title}</h3>
              <p className="feature-desc">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* COMPANIONS */}
      <section id="tovarasi" className="section section-dark">
        <h2 className="section-title">Tovarășii Regatului</h2>
        <p className="section-sub">Alege-ți aliatul. Îmbunătățește-l. Evoluează-l la nivelul 5.</p>
        <div className="companions-grid">
          {companions.map(({ name, icon, bonus }) => (
            <div key={name} className="companion-card">
              <div className="companion-icon">{icon}</div>
              <h4 className="companion-name">{name}</h4>
              <span className="companion-bonus">{bonus}</span>
            </div>
          ))}
        </div>
        <p className="companions-note">* La nivelul 5 tovarășul evoluează și deblochează bonusuri sporite</p>
      </section>

      {/* CTA */}
      <section className="cta-section">
        <h2 className="cta-title">Gata să intri în umbră?</h2>
        <p className="cta-sub">Serverul te așteaptă. Destinul tău în Regatul Cenușii începe acum.</p>
        <a href={DISCORD_INVITE} target="_blank" rel="noopener noreferrer" className="btn-primary btn-large">
          🎮 Alătură-te Acum — Gratuit
        </a>
      </section>

      {/* FOOTER */}
      <footer className="footer">
        © 2026 Regatul Cenușii · Oracolul Cenușii#5028
      </footer>
    </div>
  );
}
