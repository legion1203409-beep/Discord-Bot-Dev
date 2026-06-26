import "./index.css";

const DISCORD_INVITE = "https://discord.gg/JNYsGeMhzm";

const features = [
  {
    icon: "⚔️",
    title: "Sistem de Luptă",
    desc: "Înfruntă monștri legendari în Ora Umbrelor. Folosește abilități, tovarăși și strategie pentru a supraviețui.",
    accent: "#8b2020",
  },
  {
    icon: "🪙",
    title: "Economia Obolilor",
    desc: "Moneda regatului se câștigă prin luptă, cufere și misiuni. Investește-o în putere sau pierde-o în bătălie.",
    accent: "#c8a050",
  },
  {
    icon: "🐺",
    title: "Tovarăși & Evoluție",
    desc: "Recrutează unul din 5 tovarăși unici. La nivelul 5 evoluează, deblocând puteri noi și o înfățișare legendară.",
    accent: "#4a7a4a",
  },
  {
    icon: "⚡",
    title: "Abilități Speciale",
    desc: "Împuternicire și Scut — cumpără-le din magazin și îmbunătățește-le cu oboli și XP pentru bonusuri tot mai mari.",
    accent: "#7a4ab0",
  },
  {
    icon: "📦",
    title: "Cufere cu Comori",
    desc: "Cufere de lemn, argint și aur apar aleator în server. Fii primul care le revendică pentru recompense rare.",
    accent: "#b07020",
  },
  {
    icon: "🔮",
    title: "Oracolul Cenușii",
    desc: "Botul magic al regatului gestionează lupte, economie, evenimente și lumea întreagă — automat, non-stop.",
    accent: "#4a6a8a",
  },
];

const companions = [
  { name: "Lupul de Cenușă", icon: "🐺", bonus: "ATK +25%" },
  { name: "Corbul Umbrei", icon: "🐦‍⬛", bonus: "XP +30%" },
  { name: "Șarpele de Foc", icon: "🐍", bonus: "ATK +20%" },
  { name: "Pisica Nocturnă", icon: "🐱", bonus: "Dodge +15%" },
  { name: "Ursul de Piatră", icon: "🐻", bonus: "DEF +35%" },
];

export default function App() {
  return (
    <>
      {/* NAV */}
      <nav style={{
        position: "fixed", top: 0, left: 0, right: 0, zIndex: 100,
        padding: "0.85rem 2rem",
        display: "flex", justifyContent: "space-between", alignItems: "center",
        background: "rgba(17,13,6,0.93)",
        borderBottom: "1px solid rgba(61,46,20,0.6)",
        backdropFilter: "blur(10px)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
          <span style={{ fontSize: "1.3rem" }}>🔥</span>
          <span style={{ fontFamily: "'Cinzel', serif", color: "#f0d090", fontSize: "0.95rem", letterSpacing: "0.05em" }}>
            Regatul Cenușii
          </span>
        </div>
        <div style={{ display: "flex", gap: "1.5rem", alignItems: "center" }}>
          <a href="#sisteme" className="sans" style={{ color: "#8a7058", fontSize: "0.85rem" }}>Sisteme</a>
          <a href="#tovarasi" className="sans" style={{ color: "#8a7058", fontSize: "0.85rem" }}>Tovarăși</a>
          <a
            href={DISCORD_INVITE}
            target="_blank"
            rel="noopener noreferrer"
            className="sans"
            style={{
              background: "#5865F2",
              color: "#fff",
              padding: "0.45rem 1.15rem",
              borderRadius: "6px",
              fontSize: "0.82rem",
              fontWeight: 600,
              boxShadow: "0 2px 8px rgba(88,101,242,0.35)",
            }}
          >
            Discord
          </a>
        </div>
      </nav>

      {/* HERO */}
      <section style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        padding: "7rem 2rem 5rem",
        maxWidth: 1100,
        margin: "0 auto",
        gap: "3rem",
        flexWrap: "wrap",
      }}>
        {/* Left */}
        <div style={{ flex: "1 1 420px" }}>
          <div className="sans" style={{
            display: "inline-flex", alignItems: "center", gap: "0.4rem",
            background: "rgba(200,160,80,0.1)",
            border: "1px solid rgba(200,160,80,0.25)",
            borderRadius: "999px",
            padding: "0.3rem 1rem",
            marginBottom: "1.75rem",
            fontSize: "0.7rem",
            letterSpacing: "0.3em",
            color: "#c8a050",
            textTransform: "uppercase" as const,
          }}>
            ⚔ Server Discord RPG · Comunitate Românească
          </div>

          <h1 style={{
            fontSize: "clamp(2.8rem, 5.5vw, 5rem)",
            color: "#f0d090",
            marginBottom: "0.5rem",
            textShadow: "0 0 80px rgba(200,160,80,0.15)",
          }}>
            Regatul
          </h1>
          <h1 style={{
            fontSize: "clamp(2.8rem, 5.5vw, 5rem)",
            color: "#c8a050",
            marginBottom: "1.25rem",
            textShadow: "0 0 60px rgba(200,160,80,0.3)",
          }}>
            Cenușii
          </h1>

          <div style={{ width: 64, height: 2, background: "linear-gradient(to right, #c8a050, transparent)", marginBottom: "1.5rem" }} />

          <p style={{ fontSize: "1.1rem", color: "#8a7058", lineHeight: 1.85, marginBottom: "2.25rem", maxWidth: 480 }}>
            Un tărâm unde cenușa acoperă umbrele și eroii se nasc din foc.
            Alătură-te <em style={{ color: "#d4b896" }}>Orei Umbrelor</em> — RPG de supraviețuire pe Discord unde fiecare alegere contează.
          </p>

          <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" as const }}>
            <a
              href={DISCORD_INVITE}
              target="_blank"
              rel="noopener noreferrer"
              className="sans"
              style={{
                background: "linear-gradient(135deg, #5865F2, #4a55d4)",
                color: "#fff",
                padding: "0.9rem 2.25rem",
                borderRadius: "8px",
                fontWeight: 700,
                fontSize: "1rem",
                boxShadow: "0 4px 20px rgba(88,101,242,0.35)",
                transition: "transform 0.15s",
              }}
            >
              🎮 Intră pe Server — Gratuit
            </a>
            <a
              href="#sisteme"
              className="sans"
              style={{
                border: "1px solid #3d2e14",
                color: "#c8a050",
                padding: "0.9rem 1.75rem",
                borderRadius: "8px",
                fontSize: "0.95rem",
              }}
            >
              Descoperă lumea ↓
            </a>
          </div>

          {/* Stats */}
          <div style={{ display: "flex", gap: "2.5rem", marginTop: "3rem", flexWrap: "wrap" as const }}>
            {[["500+", "Jucători"], ["1 000+", "Lupte"], ["50+", "Evenimente"]].map(([n, l]) => (
              <div key={l}>
                <div style={{ fontFamily: "'Cinzel', serif", fontSize: "1.6rem", color: "#c8a050" }}>{n}</div>
                <div className="sans" style={{ fontSize: "0.75rem", color: "#5a4030", letterSpacing: "0.1em", textTransform: "uppercase" as const }}>{l}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Right — bot card */}
        <div style={{ flex: "1 1 300px", maxWidth: 400 }}>
          <div style={{
            background: "linear-gradient(145deg, #1e1508, #140e06)",
            border: "1px solid #3d2e14",
            borderRadius: "16px",
            padding: "2.25rem",
            boxShadow: "0 25px 60px rgba(0,0,0,0.55)",
          }}>
            <div style={{ textAlign: "center", marginBottom: "1.75rem" }}>
              <div style={{ fontSize: "2.75rem", marginBottom: "0.5rem" }}>🔮</div>
              <h3 style={{ fontFamily: "'Cinzel', serif", color: "#f0d090", fontSize: "1rem", marginBottom: "0.25rem" }}>
                Oracolul Cenușii
              </h3>
              <p className="sans" style={{ color: "#5a4030", fontSize: "0.78rem" }}>Botul tău de RPG pe Discord</p>
            </div>

            {[
              ["⚔️", "Luptă în Ora Umbrelor"],
              ["🪙", "Câștigă oboli & XP"],
              ["🐺", "Recrutează tovarăși"],
              ["📦", "Deschide cufere rare"],
              ["⚡", "Folosește abilități speciale"],
            ].map(([icon, text]) => (
              <div key={text as string} style={{
                display: "flex", alignItems: "center", gap: "0.75rem",
                padding: "0.6rem 0",
                borderBottom: "1px solid #231a0a",
              }}>
                <span style={{ fontSize: "1rem", minWidth: 20 }}>{icon}</span>
                <span className="sans" style={{ fontSize: "0.82rem", color: "#8a7058" }}>{text as string}</span>
              </div>
            ))}

            <div style={{
              marginTop: "1.5rem",
              background: "rgba(88,101,242,0.08)",
              border: "1px solid rgba(88,101,242,0.2)",
              borderRadius: "8px",
              padding: "0.75rem",
              textAlign: "center",
            }}>
              <span className="sans" style={{ color: "#7b85e8", fontSize: "0.82rem" }}>🟢 Server activ — alătură-te acum</span>
            </div>
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section id="sisteme" style={{ padding: "6rem 2rem", background: "linear-gradient(to bottom, var(--bg), var(--bg2))" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: "3.5rem" }}>
            <h2 style={{ fontSize: "2.25rem", color: "#f0d090", marginBottom: "0.75rem" }}>Lumea Jocului</h2>
            <div style={{ width: 40, height: 2, background: "#c8a050", margin: "0 auto 1rem" }} />
            <p className="sans" style={{ color: "#5a4030", fontSize: "0.9rem" }}>
              Sisteme RPG complexe, direct pe Discord
            </p>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: "1.25rem" }}>
            {features.map(({ icon, title, desc, accent }) => (
              <div key={title} style={{
                background: "#140e06",
                border: `1px solid ${accent}20`,
                borderTop: `3px solid ${accent}`,
                borderRadius: "12px",
                padding: "1.75rem",
              }}>
                <div style={{ fontSize: "1.75rem", marginBottom: "0.85rem" }}>{icon}</div>
                <h3 style={{ fontFamily: "'Cinzel', serif", color: "#f0d090", fontSize: "0.9rem", marginBottom: "0.6rem" }}>
                  {title}
                </h3>
                <p className="sans" style={{ color: "#5a4030", fontSize: "0.8rem", lineHeight: 1.65 }}>{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* COMPANIONS */}
      <section id="tovarasi" style={{ padding: "6rem 2rem", background: "var(--bg2)" }}>
        <div style={{ maxWidth: 900, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: "3rem" }}>
            <h2 style={{ fontSize: "2.25rem", color: "#f0d090", marginBottom: "0.75rem" }}>Tovarășii Regatului</h2>
            <div style={{ width: 40, height: 2, background: "#c8a050", margin: "0 auto 1rem" }} />
            <p className="sans" style={{ color: "#5a4030", fontSize: "0.9rem" }}>
              Alege-ți aliatul. Îmbunătățește-l. Evoluează-l la nivelul 5.
            </p>
          </div>

          <div style={{ display: "flex", gap: "1rem", justifyContent: "center", flexWrap: "wrap" as const }}>
            {companions.map(({ name, icon, bonus }) => (
              <div key={name} style={{
                background: "#110d06",
                border: "1px solid #3d2e14",
                borderRadius: "12px",
                padding: "1.5rem 1.25rem",
                textAlign: "center",
                minWidth: 140,
                flex: "1 1 130px",
                maxWidth: 170,
              }}>
                <div style={{ fontSize: "2.25rem", marginBottom: "0.6rem" }}>{icon}</div>
                <h4 style={{ fontFamily: "'Cinzel', serif", color: "#f0d090", fontSize: "0.78rem", marginBottom: "0.4rem" }}>{name}</h4>
                <div className="sans" style={{
                  background: "rgba(200,160,80,0.1)",
                  border: "1px solid rgba(200,160,80,0.2)",
                  borderRadius: "999px",
                  padding: "0.2rem 0.6rem",
                  fontSize: "0.72rem",
                  color: "#c8a050",
                  display: "inline-block",
                }}>
                  {bonus}
                </div>
              </div>
            ))}
          </div>

          <p className="sans" style={{ textAlign: "center", color: "#3a2810", fontSize: "0.8rem", marginTop: "1.5rem" }}>
            * La nivelul 5, tovarășul evoluează și deblochează bonusuri sporite
          </p>
        </div>
      </section>

      {/* CTA */}
      <section style={{ padding: "6rem 2rem" }}>
        <div style={{
          maxWidth: 700,
          margin: "0 auto",
          background: "linear-gradient(135deg, #1e1508, #2a1a08)",
          border: "1px solid #3d2e14",
          borderRadius: "20px",
          padding: "4rem 2rem",
          textAlign: "center",
          boxShadow: "0 0 80px rgba(200,160,80,0.05)",
        }}>
          <div style={{ fontSize: "2.5rem", marginBottom: "1rem" }}>⚔️</div>
          <h2 style={{ fontSize: "2rem", color: "#f0d090", marginBottom: "1rem" }}>
            Destinul tău te cheamă
          </h2>
          <p className="sans" style={{ color: "#6a5040", lineHeight: 1.8, marginBottom: "2rem", maxWidth: 420, margin: "0 auto 2rem" }}>
            Sute de jucători te așteaptă în Regatul Cenușii.
            Intră pe server, alege-ți tovarășul și începe să lupți.
          </p>
          <a
            href={DISCORD_INVITE}
            target="_blank"
            rel="noopener noreferrer"
            className="sans"
            style={{
              background: "linear-gradient(135deg, #5865F2, #4a55d4)",
              color: "#fff",
              padding: "1rem 2.75rem",
              borderRadius: "10px",
              fontWeight: 700,
              fontSize: "1.05rem",
              display: "inline-block",
              boxShadow: "0 8px 30px rgba(88,101,242,0.35)",
            }}
          >
            🎮 Alătură-te Acum — Gratuit
          </a>
        </div>
      </section>

      {/* FOOTER */}
      <footer style={{
        borderTop: "1px solid #2a1e0a",
        padding: "2rem",
        textAlign: "center",
      }}>
        <p className="sans" style={{ color: "#3a2810", fontSize: "0.78rem" }}>
          © 2026 Regatul Cenușii · Oracolul Cenușii#5028 · Made with 🔥
        </p>
      </footer>
    </>
  );
}
