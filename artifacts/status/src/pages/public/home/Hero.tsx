import type { CSSProperties } from "react";
import { trackEvent } from "../../../lib/analytics";
import crest from "./crest.webp";
import { Ashes, ArrowOut, Eyebrow, LiveDot, MONO, Odometer, SERIF, Sparks } from "./parts";
import type { Ambience } from "./sparks";

const strong: CSSProperties = { color: "#F6F1EA", fontWeight: "700" };

const monoLabel: CSSProperties = {
  fontFamily: MONO,
  fontSize: "11px",
  fontWeight: "500",
  letterSpacing: ".2em",
  lineHeight: "1.4",
  textTransform: "uppercase",
  color: "#8F8B86",
};

interface HeroProps {
  ambience: Pick<Ambience, "ashes" | "hero">;
  online: number | null;
  members: number | null;
  live: boolean;
  invite: string;
  inviteLabel: string;
  serverName: string;
}

export function Hero({ ambience, online, members, live, invite, inviteLabel, serverName }: HeroProps) {
  const inviteClick = (location: string) => () => trackEvent("discord_cta_click", { location });

  return (
    <section
      aria-labelledby="h-hero"
      style={{ position: "relative", overflow: "hidden", isolation: "isolate", background: "#09090B" }}
    >
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: "0",
          zIndex: "0",
          background:
            "radial-gradient(circle at 14% 22%, rgba(255,214,170,.55) 0 1px, rgba(0,0,0,0) 1.6px), radial-gradient(circle at 78% 12%, rgba(255,214,170,.45) 0 1px, rgba(0,0,0,0) 1.6px), radial-gradient(circle at 63% 38%, rgba(255,214,170,.35) 0 1px, rgba(0,0,0,0) 1.6px), radial-gradient(circle at 32% 61%, rgba(255,214,170,.4) 0 1px, rgba(0,0,0,0) 1.6px), radial-gradient(circle at 88% 70%, rgba(255,214,170,.35) 0 1px, rgba(0,0,0,0) 1.6px), radial-gradient(circle at 46% 8%, rgba(255,214,170,.3) 0 1px, rgba(0,0,0,0) 1.6px), radial-gradient(60% 45% at 0% 0%, rgba(255,107,61,.16) 0%, rgba(255,107,61,0) 70%), radial-gradient(50% 50% at 100% 25%, rgba(170,32,24,.24) 0%, rgba(170,32,24,0) 70%)",
        }}
      />
      <div aria-hidden="true" className="par2" style={{ position: "absolute", inset: "0", zIndex: "0", pointerEvents: "none" }}>
        <i className="aur a1" />
        <i className="aur a2" />
        <i className="aur a3" />
      </div>
      <div
        aria-hidden="true"
        className="par"
        style={{ position: "absolute", left: "-10%", right: "-10%", bottom: "-18%", height: "72%", zIndex: "0", pointerEvents: "none" }}
      >
        <div
          className="fire"
          style={{
            height: "100%",
            background: "radial-gradient(60% 60% at 50% 100%, rgba(255,96,40,.4) 0%, rgba(200,44,22,.2) 38%, rgba(9,9,11,0) 72%)",
          }}
        />
      </div>
      <div aria-hidden="true" style={{ position: "absolute", inset: "0", zIndex: "1", pointerEvents: "none" }}>
        <Ashes items={ambience.ashes} />
        <Sparks items={ambience.hero} />
      </div>

      <div
        style={{
          position: "relative",
          zIndex: "2",
          width: "100%",
          maxWidth: "1200px",
          margin: "0 auto",
          padding: "clamp(44px,8vw,104px) clamp(20px,5vw,56px) clamp(72px,10vw,128px)",
          boxSizing: "border-box",
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: "56px 72px",
        }}
      >
        <div style={{ flex: "1 1 540px", minWidth: "0" }}>
          <Eyebrow lineClass="eyL" textClass="rs">
            Comunitate românească · Discord
          </Eyebrow>
          <h1
            id="h-hero"
            style={{
              margin: "22px 0 0",
              fontFamily: SERIF,
              fontWeight: "600",
              fontSize: "clamp(46px,12vw,92px)",
              lineHeight: ".98",
              letterSpacing: "-.012em",
              color: "#F6F1EA",
            }}
          >
            <span className="mask">
              <span className="up1">Un loc pentru</span>
            </span>
            <span className="mask">
              <span className="up2">
                <span className="emberText" style={{ display: "block", paddingBottom: ".14em" }}>
                  oameni și povești.
                </span>
              </span>
            </span>
          </h1>
          <p
            className="rs rs1"
            style={{ margin: "18px 0 0", maxWidth: "34em", fontSize: "clamp(17px,1.5vw,19px)", lineHeight: "1.7", color: "#B7B3AD" }}
          >
            Oracolul Cenușii este o comunitate românească pe Discord, construită în jurul conversațiilor, întâlnirilor și oamenilor care
            revin. Intră, fă cunoștință și găsește-ți locul în ritmul tău.
          </p>

          <div style={{ marginTop: "26px", display: "flex", flexWrap: "wrap", gap: "10px" }}>
            <span
              className="pp pp1"
              data-testid="data-online-count"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "10px",
                padding: "8px 14px",
                border: "1px solid rgba(61,220,132,.3)",
                borderRadius: "999px",
                background: "rgba(61,220,132,.07)",
                fontSize: "14px",
                lineHeight: "1.2",
                color: "#CBE9D7",
              }}
            >
              <LiveDot live={live} />
              <span>
                <strong style={strong}>
                  <Odometer value={online} kind="t" />
                </strong>{" "}
                online acum
              </span>
            </span>
            <span
              className="pp pp2"
              data-testid="data-total-members"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "10px",
                padding: "8px 14px",
                border: "1px solid rgba(255,255,255,.1)",
                borderRadius: "999px",
                background: "rgba(255,255,255,.03)",
                fontSize: "14px",
                lineHeight: "1.2",
                color: "#B7B3AD",
              }}
            >
              <svg className="ico" aria-hidden="true" viewBox="0 0 24 24" width="16" height="16" style={{ color: "#E2B467" }}>
                <path d="M16 19v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 17.5V19M10 11a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4zM20 19v-1.5a3.5 3.5 0 0 0-2.6-3.4M15.5 4.7a3.2 3.2 0 0 1 0 6.2" />
              </svg>
              <span>
                <strong style={strong}>
                  <Odometer value={members} kind="t" />
                </strong>{" "}
                membri
              </span>
            </span>
          </div>

          <div
            className="rs rs3"
            style={{ marginTop: "30px", display: "flex", flexWrap: "wrap", alignItems: "center", gap: "14px 24px" }}
          >
            <span className="ping">
              <a
                className="btnP"
                href={invite}
                target="_blank"
                rel="noopener noreferrer"
                onClick={inviteClick("server_guide_hero")}
                data-testid="link-server-guide-invite"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "12px",
                  minHeight: "56px",
                  padding: "0 28px",
                  boxSizing: "border-box",
                  borderRadius: "12px",
                  background: "linear-gradient(135deg,#D24320 0%,#B3301B 55%,#8E2116 100%)",
                  boxShadow: "0 14px 36px -10px rgba(255,90,40,.75), inset 0 1px 0 rgba(255,255,255,.22)",
                  color: "#FFFFFF",
                  fontWeight: "700",
                  fontSize: "16px",
                  letterSpacing: ".01em",
                  textDecoration: "none",
                }}
              >
                Alătură-te comunității
                <ArrowOut size={18} />
              </a>
            </span>
            <a
              className="lnk"
              href="#acum"
              style={{ display: "inline-flex", alignItems: "center", gap: "8px", minHeight: "44px", color: "#E2B467", fontWeight: "500", fontSize: "16px" }}
            >
              Vezi comunitatea live
              <svg className="ico bob" aria-hidden="true" viewBox="0 0 24 24" width="18" height="18">
                <path d="M12 5v14M6 13l6 6 6-6" />
              </svg>
            </a>
          </div>
        </div>

        <div className="hCard" style={{ position: "relative", flex: "0 1 410px", minWidth: "0" }}>
          <div
            aria-hidden="true"
            className="breathe"
            style={{
              position: "absolute",
              left: "4%",
              right: "-4%",
              top: "14%",
              bottom: "-6%",
              zIndex: "0",
              borderRadius: "40px",
              background: "radial-gradient(closest-side, rgba(255,90,40,.45), rgba(160,30,20,.2) 60%, rgba(9,9,11,0))",
              filter: "blur(28px)",
            }}
          />
          <div
            className="gb float"
            style={{ position: "relative", zIndex: "1", borderRadius: "18px", padding: "1px", boxShadow: "0 40px 80px -30px rgba(0,0,0,.9)" }}
          >
            <div style={{ borderRadius: "17px", overflow: "hidden", background: "linear-gradient(180deg,#17191E 0%,#111317 100%)" }}>
              <div style={{ position: "relative", height: "112px", overflow: "hidden", background: "#2A0F0B" }}>
                <span className="bnrImg" aria-hidden="true" />
                <span className="rays" aria-hidden="true" />
                <span
                  style={{
                    position: "absolute",
                    top: "14px",
                    right: "14px",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "8px",
                    padding: "6px 11px",
                    borderRadius: "999px",
                    border: "1px solid rgba(255,255,255,.14)",
                    background: "rgba(9,9,11,.62)",
                    fontFamily: MONO,
                    fontSize: "11px",
                    fontWeight: "500",
                    letterSpacing: ".16em",
                    lineHeight: "1",
                    color: "#F6F1EA",
                  }}
                >
                  <LiveDot live={live} />
                  {live ? "LIVE" : "OFFLINE"}
                </span>
              </div>
              <div style={{ padding: "0 24px 24px" }}>
                <div style={{ position: "relative", width: "88px", height: "88px", marginTop: "-46px" }}>
                  <span className="halo" aria-hidden="true" />
                  <span className="sonar" aria-hidden="true" />
                  <span className="sonar s2" aria-hidden="true" />
                  <span className="rune" aria-hidden="true" />
                  <img
                    src={crest}
                    alt={`Emblema serverului ${serverName}`}
                    width="88"
                    height="88"
                    style={{
                      position: "relative",
                      display: "block",
                      width: "88px",
                      height: "88px",
                      borderRadius: "50%",
                      boxShadow: "0 0 0 4px #17191E, 0 0 0 5px rgba(226,180,103,.75), 0 0 30px 6px rgba(255,107,61,.35)",
                    }}
                  />
                </div>
                <p style={{ margin: "18px 0 0", ...monoLabel }}>Server Discord</p>
                <p
                  data-testid="text-server-name"
                  style={{ margin: "4px 0 0", fontFamily: SERIF, fontWeight: "600", fontSize: "34px", lineHeight: "1.1", color: "#F6F1EA" }}
                >
                  {serverName}
                </p>
                <div
                  style={{
                    marginTop: "10px",
                    display: "flex",
                    flexWrap: "wrap",
                    alignItems: "center",
                    gap: "6px 18px",
                    fontSize: "14px",
                    lineHeight: "1.3",
                    color: "#B7B3AD",
                  }}
                >
                  <span style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}>
                    <span
                      aria-hidden="true"
                      style={{ flex: "none", width: "8px", height: "8px", borderRadius: "50%", background: live ? "#3DDC84" : "#77736E" }}
                    />
                    <span>
                      <strong style={strong}>
                        <Odometer value={online} kind="t" />
                      </strong>{" "}
                      online
                    </span>
                  </span>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}>
                    <span aria-hidden="true" style={{ flex: "none", width: "8px", height: "8px", borderRadius: "50%", background: "#77736E" }} />
                    <span>
                      <strong style={strong}>
                        <Odometer value={members} kind="t" />
                      </strong>{" "}
                      membri
                    </span>
                  </span>
                </div>
                <a
                  className="invite"
                  href={invite}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={inviteClick("server_guide_identity")}
                  data-testid="link-server-guide-identity-invite"
                  style={{
                    marginTop: "20px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "12px",
                    minHeight: "50px",
                    padding: "0 16px",
                    boxSizing: "border-box",
                    borderRadius: "12px",
                    border: "1px solid rgba(226,180,103,.32)",
                    background: "rgba(226,180,103,.06)",
                    fontFamily: MONO,
                    fontSize: "14px",
                    lineHeight: "1.3",
                    color: "#F3D08E",
                    textDecoration: "none",
                  }}
                >
                  <span style={{ minWidth: "0", overflowWrap: "anywhere" }}>{inviteLabel}</span>
                  <ArrowOut size={18} />
                </a>
                <div
                  data-testid="status-server-presence"
                  aria-live="polite"
                  style={{
                    marginTop: "18px",
                    paddingTop: "16px",
                    borderTop: "1px solid rgba(255,255,255,.07)",
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                    fontFamily: MONO,
                    fontSize: "12px",
                    lineHeight: "1.4",
                    color: "#8F8B86",
                  }}
                >
                  <LiveDot live={live} />
                  <span>{live ? "Prezență Discord actualizată" : "Prezența Discord nu poate fi citită acum"}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
