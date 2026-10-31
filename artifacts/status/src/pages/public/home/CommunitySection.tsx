import type { CSSProperties } from "react";
import { Eyebrow, Lede, LiveDot, MONO, Odometer, SERIF, SectionTitle, sectionBox } from "./parts";

const monoLabel: CSSProperties = {
  fontFamily: MONO,
  fontSize: "12px",
  fontWeight: "500",
  letterSpacing: ".18em",
  lineHeight: "1.4",
  textTransform: "uppercase",
  color: "#E2B467",
};

const footLabel: CSSProperties = {
  fontFamily: MONO,
  fontSize: "11px",
  fontWeight: "500",
  letterSpacing: ".14em",
  lineHeight: "1.3",
  textTransform: "uppercase",
  color: "#8F8B86",
};

const bigNumber: CSSProperties = {
  margin: "8px 0 0",
  fontFamily: SERIF,
  fontWeight: "700",
  fontSize: "clamp(72px,18vw,108px)",
  lineHeight: "1",
};

const cardBox: CSSProperties = {
  position: "relative",
  overflow: "hidden",
  borderRadius: "16px",
  padding: "clamp(22px,3vw,30px)",
  boxSizing: "border-box",
  display: "flex",
  flexDirection: "column",
};

interface CommunityProps {
  online: number | null;
  members: number | null;
  live: boolean;
}

export function CommunitySection({ online, members, live }: CommunityProps) {
  const share = online != null && members != null && members > 0 ? Math.min(100, (online / members) * 100) : null;
  const pct = share == null ? "—" : Math.round(share) + "%";
  // Fără cifre nu desenăm nimic în bară; cu cifre, cel puțin 2% ca să se vadă că există.
  const bar = share == null ? null : Math.max(2, share).toFixed(2) + "%";

  return (
    <section id="acum" aria-labelledby="h-acum" style={sectionBox}>
      <div style={{ maxWidth: "720px" }}>
        <Eyebrow>Snapshot live</Eyebrow>
        <SectionTitle id="h-acum" first="Comunitatea, acum." />
        <Lede>Numărul online este prezența aproximativă raportată de Discord. Se actualizează automat la fiecare 10 secunde.</Lede>
      </div>

      <div
        style={{
          marginTop: "clamp(32px,5vw,48px)",
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(min(300px,100%), 1fr))",
          gap: "16px",
        }}
      >
        <div
          className="card rv vt"
          style={{
            ...cardBox,
            border: "1px solid rgba(255,107,61,.32)",
            background:
              "radial-gradient(110% 90% at 0% 0%, rgba(255,107,61,.2) 0%, rgba(255,107,61,0) 58%), linear-gradient(180deg,#16181C 0%,#111316 100%)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
            <span className="ringB" aria-hidden="true" />
            <span
              aria-hidden="true"
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: "46px",
                height: "46px",
                borderRadius: "13px",
                border: "1px solid rgba(255,107,61,.38)",
                background: "linear-gradient(135deg, rgba(255,107,61,.3), rgba(255,107,61,.08))",
                color: "#FF8A5B",
                boxShadow: "0 0 26px -6px rgba(255,107,61,.65)",
              }}
            >
              <svg className="ico" viewBox="0 0 24 24" width="22" height="22">
                <path className="ecgB" d="M3 12h4l2.5-6 4 12 2.5-6H21" />
                <path className="ecgR" pathLength="100" d="M3 12h4l2.5-6 4 12 2.5-6H21" />
              </svg>
            </span>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                padding: "6px 11px",
                borderRadius: "999px",
                border: "1px solid rgba(61,220,132,.3)",
                background: "rgba(61,220,132,.07)",
                fontFamily: MONO,
                fontSize: "11px",
                fontWeight: "500",
                letterSpacing: ".16em",
                lineHeight: "1",
                color: "#CBE9D7",
              }}
            >
              <LiveDot live={live} />
              {live ? "LIVE" : "OFFLINE"}
            </span>
          </div>
          <p style={{ margin: "24px 0 0", ...monoLabel }}>Online acum · Prezență Discord</p>
          <p style={{ ...bigNumber, color: "#FFF6EE", "--oc-glow": "rgba(255,107,61,.55)" } as CSSProperties}>
            <Odometer value={online} kind="s g" />
          </p>
          <p style={{ margin: "6px 0 0", fontSize: "15px", lineHeight: "1.5", color: "#B7B3AD" }}>Membri prezenți în acest moment</p>
          <div style={{ marginTop: "auto", paddingTop: "26px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", ...footLabel }}>
              <span>Din toți membrii</span>
              <span style={{ color: "#F3D08E" }}>{pct}</span>
            </div>
            <div style={{ marginTop: "10px", height: "6px", borderRadius: "999px", background: "rgba(255,255,255,.07)", overflow: "hidden" }}>
              {bar ? (
                <div
                  className="bar"
                  style={{
                    width: bar,
                    height: "100%",
                    borderRadius: "999px",
                    background: "linear-gradient(90deg,#FF6B3D,#FFB45E)",
                    boxShadow: "0 0 12px rgba(255,107,61,.8)",
                  }}
                />
              ) : null}
            </div>
          </div>
        </div>

        <div
          className="card rv vt"
          style={{
            ...cardBox,
            border: "1px solid rgba(255,255,255,.09)",
            background:
              "radial-gradient(110% 90% at 100% 0%, rgba(226,180,103,.13) 0%, rgba(226,180,103,0) 55%), linear-gradient(180deg,#16181C 0%,#111316 100%)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
            <span className="ringB" aria-hidden="true" />
            <span
              aria-hidden="true"
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: "46px",
                height: "46px",
                borderRadius: "13px",
                border: "1px solid rgba(226,180,103,.34)",
                background: "linear-gradient(135deg, rgba(226,180,103,.22), rgba(226,180,103,.05))",
                color: "#F3D08E",
                boxShadow: "0 0 26px -8px rgba(226,180,103,.55)",
              }}
            >
              <svg className="ico" viewBox="0 0 24 24" width="22" height="22">
                <path d="M16 19v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 17.5V19M10 11a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4zM20 19v-1.5a3.5 3.5 0 0 0-2.6-3.4M15.5 4.7a3.2 3.2 0 0 1 0 6.2" />
              </svg>
            </span>
          </div>
          <p style={{ margin: "24px 0 0", ...monoLabel }}>Membri în server</p>
          <p style={{ ...bigNumber, color: "#F6F1EA", "--oc-glow": "rgba(226,180,103,.3)" } as CSSProperties}>
            <Odometer value={members} kind="s g" />
          </p>
          <p style={{ margin: "6px 0 0", fontSize: "15px", lineHeight: "1.5", color: "#B7B3AD" }}>Total raportat de Discord</p>
          <div
            style={{
              marginTop: "auto",
              paddingTop: "26px",
              display: "flex",
              alignItems: "center",
              gap: "10px",
              ...footLabel,
            }}
          >
            <span className="ring10" aria-hidden="true" />
            <span>Actualizare la fiecare 10 secunde</span>
          </div>
        </div>
      </div>
    </section>
  );
}
