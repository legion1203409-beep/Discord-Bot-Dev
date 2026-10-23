import type { CSSProperties } from "react";
import { Link } from "wouter";
import { trackEvent } from "../../../lib/analytics";
import crest from "./crest.webp";
import { LiveDot, MONO } from "./parts";

const mono = (extra: CSSProperties): CSSProperties => ({ fontFamily: MONO, ...extra });

const link: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  minHeight: "44px",
  fontSize: "15px",
  color: "#B7B3AD",
};

export function Footer({ invite, inviteLabel, live }: { invite: string; inviteLabel: string; live: boolean }) {
  return (
    <footer className="ftr" style={{ borderTop: "1px solid rgba(255,255,255,.06)", background: "#070708" }}>
      <div
        style={{
          width: "100%",
          maxWidth: "1200px",
          margin: "0 auto",
          padding: "clamp(44px,6vw,64px) clamp(20px,5vw,56px) 48px",
          boxSizing: "border-box",
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "space-between",
          gap: "36px 64px",
        }}
      >
        <div style={{ flex: "1 1 300px", minWidth: "0" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <img
              className="crestG"
              src={crest}
              alt=""
              width="40"
              height="40"
              style={{
                display: "block",
                width: "40px",
                height: "40px",
                borderRadius: "50%",
                boxShadow: "0 0 0 1px rgba(226,180,103,.6), 0 0 18px rgba(255,107,61,.25)",
              }}
            />
            <span style={{ display: "inline-flex", alignItems: "baseline", gap: "8px", lineHeight: "1" }}>
              <span style={{ fontWeight: "700", fontSize: "16px", letterSpacing: ".24em", color: "#F6F1EA" }}>REGATUL</span>
              <span style={{ fontWeight: "500", fontSize: "10.5px", letterSpacing: ".42em", color: "#E2B467" }}>CENUȘII</span>
            </span>
          </div>
          <p style={mono({ margin: "18px 0 0", maxWidth: "30em", fontSize: "13px", lineHeight: "1.6", color: "#8F8B86" })}>
            Un loc primitor pentru comunitatea Oracolul Cenușii.
          </p>
          <a
            className="lnk"
            href={invite}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => trackEvent("discord_cta_click", { location: "server_guide_custom_footer" })}
            data-testid="link-server-guide-footer-invite"
            style={mono({ display: "inline-flex", alignItems: "center", gap: "8px", minHeight: "44px", marginTop: "4px", fontSize: "13px", color: "#F3D08E" })}
          >
            {inviteLabel}
            <svg className="ico" aria-hidden="true" viewBox="0 0 24 24" width="16" height="16" style={{ color: "#FF8A5B" }}>
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </a>
        </div>
        <div style={{ flex: "1 1 300px", minWidth: "0" }}>
          <p
            style={mono({
              margin: "0",
              fontSize: "11px",
              fontWeight: "500",
              letterSpacing: ".18em",
              lineHeight: "1.5",
              textTransform: "uppercase",
              color: "#8F8B86",
            })}
          >
            Oracolul Cenușii · Comunitate Discord
          </p>
          <nav aria-label="Legături utile" style={{ marginTop: "8px", display: "flex", flexWrap: "wrap", gap: "0 24px" }}>
            <a className="lnk" href="#top" data-testid="link-footer-server-guide" style={link}>
              Ghidul serverului
            </a>
            <Link className="lnk" href="/verificare" data-testid="link-footer-verification" style={link}>
              Verificare membri
            </Link>
            <Link className="lnk" href="/statistici" data-testid="link-footer-stats" style={link}>
              Statistici
            </Link>
            <Link className="lnk" href="/moderare" data-testid="link-footer-moderation" style={link}>
              Consolă operator
            </Link>
          </nav>
          <p style={mono({ margin: "12px 0 0", display: "flex", alignItems: "center", gap: "10px", fontSize: "12px", lineHeight: "1.4", color: "#8F8B86" })}>
            <LiveDot live={live} />
            <a
              className="lnk"
              href="/#status"
              onClick={() => trackEvent("operator_status_open", { location: "footer" })}
              data-testid="link-footer-status"
              style={{ color: "#8F8B86" }}
            >
              operator / stare live
            </a>
          </p>
          <p style={mono({ margin: "10px 0 0", fontSize: "12px", lineHeight: "1.4", color: "#8F8B86" })}>
            © {new Date().getFullYear()} · Fără tron, doar povești.
          </p>
        </div>
      </div>
    </footer>
  );
}
