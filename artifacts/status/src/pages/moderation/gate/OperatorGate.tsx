/**
 * Pagina „Autentificare operator”: intrarea în regat sau în panoul botului.
 *
 * Aspectul vine din designul „Autentificare operator” (vezi `gate.css`).
 * Butoanele panoului și „Conectează-te cu Discord” pornesc autentificarea
 * Discord reală; cât timp aceasta nu e gata (se verifică, a dat eroare sau nu
 * e configurată), în locul lor apare starea respectivă.
 */
import { useEffect, useRef, type CSSProperties } from "react";
import crest from "../../public/home/crest.webp";
import { buildGateAmbience } from "./ambience";
import type { GateAuth } from "./authState";
import { useGateParallax } from "./useGateParallax";
import "./gate.css";

const TITLE = "Autentificare operator | Regatul Cenușii";

/** Poziția scânteilor și a cenușii: aceeași la fiecare vizită, calculată o singură dată. */
const AMBIENCE = buildGateAmbience();

/** Etichetele serverului sunt text liber (emoji + cuvânt), fără majuscule și fără litere distanțate. */
const FREE_FONT = '"Segoe UI", system-ui, -apple-system, sans-serif';
const freeLabel = (color: string): CSSProperties => ({
  display: "block",
  color,
  letterSpacing: "normal",
  textTransform: "none",
  fontFamily: FREE_FONT,
  fontSize: "14px",
  lineHeight: "20px",
});

/** Scânteile din bannerul cardului serverului: poziție, întârziere, durată, abatere. */
const BANNER_SPARKS: { left: string; d: string; t: string; x: string }[] = [
  { left: "14%", d: "0s", t: "5.6s", x: "8px" },
  { left: "27%", d: "-2.1s", t: "6.8s", x: "-10px" },
  { left: "41%", d: "-4.4s", t: "5.2s", x: "12px" },
  { left: "56%", d: "-1.2s", t: "7.4s", x: "-6px" },
  { left: "69%", d: "-3.3s", t: "6.1s", x: "9px" },
  { left: "83%", d: "-5.2s", t: "5.8s", x: "-12px" },
  { left: "93%", d: "-0.6s", t: "7s", x: "6px" },
];

/** Titlul filei, cât timp pagina e pe ecran; la plecare se pune la loc. */
function usePageTitle() {
  useEffect(() => {
    const previous = document.title;
    document.title = TITLE;
    return () => {
      document.title = previous;
    };
  }, []);
}

/** Cât timp pagina e pe ecran, fundalul întregii file e cel din design. */
function useDocumentTheme() {
  useEffect(() => {
    const root = document.documentElement;
    root.classList.add("oc-gate-on");
    return () => root.classList.remove("oc-gate-on");
  }, []);
}

function ArrowIcon() {
  return (
    <svg className="ico" aria-hidden="true" viewBox="0 0 24 24" width="20" height="20">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

function RefreshIcon({ spin }: { spin?: boolean }) {
  return (
    <svg className={spin ? "ico spinI" : "ico"} aria-hidden="true" viewBox="0 0 24 24" width="17" height="17">
      <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8M21 3v5h-5M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16M8 16H3v5" />
    </svg>
  );
}

export interface OperatorGateProps {
  /** Numele botului, așa cum îl știe Discord; dacă lipsește, „Oracolul Cenușii”. */
  botName?: string | null;
  /** Starea autentificării Discord. */
  auth: GateAuth;
  /** Mesajul pentru o autentificare eșuată (din adresa paginii), dacă există. */
  authError: string | null;
  /** Invitația publică a botului; fără ea, butonul de invitare nu apare. */
  botInviteUrl?: string | null;
}

export function OperatorGate({ botName, auth, authError, botInviteUrl }: OperatorGateProps) {
  const root = useRef<HTMLDivElement>(null);
  usePageTitle();
  useDocumentTheme();
  useGateParallax(root);

  const loginUrl = auth.kind === "ready" ? auth.loginUrl : null;

  return (
    <div className="oc-gate" ref={root} data-testid="operator-gate">
      <div className="bg" aria-hidden="true">
        <div className="px1">
          <i className="aur a1" />
          <i className="aur a2" />
          <i className="aur a3" />
        </div>
        <div className="fire" />
        <div className="px2">
          <i className="arc arcA" />
          <i className="arc arcB" />
          <i className="arc arcC" />
        </div>
        <i className="streak" style={{ left: "6%", top: "80%", animationDelay: "1.6s" }} />
        <i className="streak" style={{ left: "56%", top: "94%", animationDelay: "5.4s", animationDuration: "13s" }} />
        <i className="streak" style={{ left: "28%", top: "108%", animationDelay: "8.6s", animationDuration: "15s" }} />
        {AMBIENCE.ashes.map((a, i) => (
          <span
            key={i}
            className="ash"
            style={
              {
                left: a.left,
                top: a.top,
                width: a.size,
                height: a.size,
                animationDuration: a.dur,
                animationDelay: a.delay,
                "--ocg-sw": a.sw,
                "--ocg-o": a.o,
              } as CSSProperties
            }
          />
        ))}
        {AMBIENCE.embers.map((p, i) => (
          <span
            key={i}
            className={p.cls}
            style={{ left: p.left, bottom: p.bottom, width: p.size, height: p.size, animationDuration: p.dur, animationDelay: p.delay }}
          />
        ))}
      </div>

      <a className="gtBrand" href="/" aria-label="Regatul Cenușii, pagina comunității" data-testid="link-gate-brand">
        <img className="crestG" src={crest} alt="" width="38" height="38" />
        <span className="bw">
          <span className="bw1">REGATUL</span>
          <span className="bw2">CENUȘII</span>
        </span>
      </a>

      <main className="stage">
        <section className="gate" aria-labelledby="h-auth">
          <div className="seal" aria-hidden="true">
            <i className="sl sGlow" />
            <i className="sl sRays" />
            <i className="sl sTicks" />
            <i className="sl sMajor" />
            <i className="sl sRing" />
            <div className="sl sText">
              <svg viewBox="0 0 452 452">
                <defs>
                  <path id="gtSealArc" d="M226 226m-198 0a198 198 0 1 1 396 0a198 198 0 1 1-396 0" />
                </defs>
                <text>
                  <textPath href="#gtSealArc" textLength="1240" lengthAdjust="spacing">
                    REGATUL CENUȘII · OPERAȚIUNI DE MODERARE · ACCES CONTROLAT · ORACOLUL CENUȘII ·
                  </textPath>
                </text>
              </svg>
            </div>
            <i className="sl sDash" />
          </div>

          <div className="medal">
            <span className="halo" aria-hidden="true" />
            <span className="sonar" aria-hidden="true" />
            <span className="sonar s2" aria-hidden="true" />
            <span className="rune rune2" aria-hidden="true" />
            <span className="rune" aria-hidden="true" />
            <span className="flash" aria-hidden="true" />
            <img src={crest} alt="Emblema Oracolul Cenușii" width="124" height="124" />
          </div>

          <div className="intro">
            <p className="lab rs e1">{botName || "Oracolul Cenușii"}</p>
            <p className="sub rs e2">Operațiuni de moderare</p>
            <p className="chip pp e3">
              <svg className="ico" aria-hidden="true" viewBox="0 0 24 24" width="14" height="14">
                <rect x="5" y="11" width="14" height="9.5" rx="2.5" />
                <path className="lockSh" d="M8.5 11V8a3.5 3.5 0 0 1 7 0v3" />
              </svg>
              Acces controlat
              <span className="dotE" aria-hidden="true" />
            </p>
            <h1 id="h-auth" className="ttl" aria-label="Autentificare Operator">
              <span className="mask">
                <span className="up1">Autentificare</span>
              </span>
              <span className="mask">
                <span className="up2">
                  <span className="emberText" style={{ display: "block", paddingBottom: ".14em" }}>
                    Operator
                  </span>
                </span>
              </span>
            </h1>
            <p className="lead rs e5">Alege unde intri: Regatul Cenușii sau panoul botului.</p>
            {authError ? (
              <div className="gateNote err rs e6" role="alert">
                {authError}
              </div>
            ) : null}
          </div>

          <div className="tilt">
            <div className="doors">
              <div className="pw" style={{ "--ocg-b": "0s" } as CSSProperties}>
                <div className="gb">
                  <article className="card door srv guideC" aria-labelledby="d-srv">
                    <span className="gGlow" aria-hidden="true" />
                    <div className="cIn">
                      <div className="gBanner" aria-hidden="true">
                        <span className="gbImg" />
                        <span className="gbRays" />
                        {BANNER_SPARKS.map((s) => (
                          <span
                            key={s.left}
                            className="gbSpark"
                            style={{ left: s.left, "--ocg-d": s.d, "--ocg-t": s.t, "--ocg-x": s.x } as CSSProperties}
                          />
                        ))}
                        <span className="gbFade" />
                        <span className="gbSweep" />
                        <span className="gOfficial">
                          <svg className="ico" viewBox="0 0 24 24" width="15" height="15">
                            <path d="M12 3l2.2 1.6 2.7-.2.8 2.6 2.2 1.6-.9 2.6.9 2.6-2.2 1.6-.8 2.6-2.7-.2L12 21l-2.2-1.6-2.7.2-.8-2.6-2.2-1.6.9-2.6-.9-2.6 2.2-1.6.8-2.6 2.7.2zM8.8 12.2l2.2 2.2 4.2-4.6" />
                          </svg>
                          Server oficial
                        </span>
                      </div>
                      <div className="gHead">
                        <div className="gAv">
                          <span className="gHalo" aria-hidden="true" />
                          <span className="gSonar" aria-hidden="true" />
                          <span className="gSonar s2" aria-hidden="true" />
                          <span className="gOrbit" aria-hidden="true" />
                          <span className="gOrbit o2" aria-hidden="true" />
                          <span className="gText" aria-hidden="true">
                            <svg viewBox="0 0 164 164">
                              <defs>
                                <path id="gtCardArc" d="M82 82m-70 0a70 70 0 1 1 140 0a70 70 0 1 1-140 0" />
                              </defs>
                              <text>
                                <textPath href="#gtCardArc" textLength="436" lengthAdjust="spacing">
                                  REGATUL CENUȘII · SERVER OFICIAL · COMUNITATE ROMÂNEASCĂ ·
                                </textPath>
                              </text>
                            </svg>
                          </span>
                          <img src={crest} alt="Emblema oficială a serverului Regatul Cenușii" width="104" height="104" />
                          <span className="gAvShine" aria-hidden="true" />
                          <span className="gFlash" aria-hidden="true" />
                        </div>
                        <span
                          className="kick"
                          style={{ position: "static", display: "block", color: "#ff9a6b", backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)" }}
                        >
                          <span style={freeLabel("rgba(243, 208, 142, 0.7)")}>🌑 Dark Fantasy</span>
                        </span>
                      </div>
                      <h2 id="d-srv" className="dTitle">
                        Regatul <span className="emberText">Cenușii</span>
                      </h2>
                      <p className="dDesc">
                        Pagina oficială a Regatului Cenușii: cine suntem, ce se întâmplă acum în comunitate și cum intri. Acolo îl poți întreba și pe Oracol.
                      </p>
                      <ul className="tags">
                        <li>
                          <span style={freeLabel("#ff9a6b")}>🎮 Gaming</span>
                        </li>
                        <li>
                          <span style={freeLabel("#ff9a6b")}>💬 Comunitate</span>
                        </li>
                        <li>
                          <span style={freeLabel("#ff9a6b")}>🏰 Comunitate RO</span>
                        </li>
                      </ul>
                      <div className="acts">
                        <span className="ping">
                          <a className="btnP btnRealm" href="/" data-testid="link-server-guide-login">
                            Intră în regat
                            <ArrowIcon />
                          </a>
                        </span>
                      </div>
                    </div>
                  </article>
                </div>
              </div>

              <div className="pw" style={{ "--ocg-b": ".14s" } as CSSProperties}>
                <div className="gb gold">
                  <article className="card door bot" aria-labelledby="d-bot">
                    <span className="gridW" aria-hidden="true">
                      <span className="scan" />
                    </span>
                    <div className="cIn">
                      <div className="dHead">
                        <span className="badge g" aria-hidden="true">
                          <svg className="ico" viewBox="0 0 24 24" width="24" height="24">
                            <rect x="4.5" y="8" width="15" height="11.5" rx="3.5" />
                            <path d="M12 8V4.8M3 12.5v3M21 12.5v3M9.5 16.2h5" />
                            <circle cx="12" cy="4" r=".9" />
                            <path className="eye" d="M9.2 12.6h.01M14.8 12.6h.01" strokeWidth="2.6" />
                          </svg>
                        </span>
                        <span className="kick gold">Meniu · Bot</span>
                      </div>
                      <h2 id="d-bot" className="dTitle">
                        Panoul <span className="goldText">botului</span>
                      </h2>
                      <p className="dDesc">Consola Oracolului: modulele, apărările, comenzile și setările pentru fiecare dintre ele.</p>
                      <ul className="tags gold">
                        <li>29 de module</li>
                        <li>Setări pe modul</li>
                        <li>Statistici bot</li>
                      </ul>
                      <div className="acts">
                        {loginUrl ? (
                          <a className="btnGold" href={loginUrl} data-testid="button-open-panel">
                            Deschide panoul botului
                            <ArrowIcon />
                          </a>
                        ) : (
                          <a className="btnGold off" role="link" aria-disabled="true" data-testid="button-open-panel">
                            Deschide panoul botului
                            <ArrowIcon />
                          </a>
                        )}
                        {botInviteUrl ? (
                          <a className="btnG" href={botInviteUrl} target="_blank" rel="noopener noreferrer" data-testid="link-invite-bot">
                            <svg className="ico" aria-hidden="true" viewBox="0 0 24 24" width="20" height="20">
                              <path d="M12 5v14M5 12h14" />
                            </svg>
                            Invită botul pe server
                          </a>
                        ) : null}
                      </div>
                    </div>
                  </article>
                </div>
              </div>
            </div>
          </div>

          <div className="below">
            <div className="sep ln e8" aria-hidden="true" />
            {auth.kind === "ready" ? (
              <a className="guide rs e9" href={auth.loginUrl} data-testid="discord-login-button">
                <svg className="ico bk" aria-hidden="true" viewBox="0 0 24 24" width="17" height="17">
                  <path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l5-5-5-5M15 12H4" />
                </svg>
                Conectează-te cu Discord
              </a>
            ) : auth.kind === "checking" ? (
              <p className="gateNote rs e9">
                <RefreshIcon spin />
                Se verifică disponibilitatea autentificării Discord...
              </p>
            ) : auth.kind === "error" ? (
              <>
                <div className="gateNote err rs e9" role="alert">
                  {auth.message}
                </div>
                <button className="btnG retry rs e9" type="button" onClick={auth.retry} data-testid="button-retry-auth-config">
                  <RefreshIcon />
                  Reîncearcă
                </button>
              </>
            ) : (
              <p className="gateNote rs e9" role="status">
                Autentificarea Discord nu este disponibilă momentan. Administratorul trebuie să configureze integrarea OAuth înainte de conectare.
              </p>
            )}
          </div>
        </section>
      </main>

      {AMBIENCE.foreground.map((p, i) => (
        <span
          key={i}
          className={p.cls}
          style={{ left: p.left, bottom: p.bottom, width: p.size, height: p.size, animationDuration: p.dur, animationDelay: p.delay }}
        />
      ))}
    </div>
  );
}
