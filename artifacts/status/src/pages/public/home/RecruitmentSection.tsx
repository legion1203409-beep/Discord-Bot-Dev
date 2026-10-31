import type { CSSProperties, ReactNode } from "react";
import type { RecruitmentDashboard } from "@workspace/api-client-react";
import { fmt, formatTimestamp } from "./format";
import { Eyebrow, Lede, MONO, Odometer, SERIF, SectionTitle, StateCard, sectionBox } from "./parts";
import type { RecruitmentView } from "./recruitment";

const panel: CSSProperties = {
  position: "relative",
  borderRadius: "16px",
  border: "1px solid rgba(255,255,255,.08)",
  background: "linear-gradient(180deg,#16181C 0%,#101215 100%)",
  padding: "clamp(20px,3vw,30px)",
  boxSizing: "border-box",
};

const panelIcon: CSSProperties = {
  flex: "none",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: "46px",
  height: "46px",
  borderRadius: "13px",
  border: "1px solid rgba(226,180,103,.3)",
  background: "rgba(226,180,103,.09)",
  color: "#E2B467",
};

const monoSmall: CSSProperties = {
  fontFamily: MONO,
  fontSize: "11px",
  fontWeight: "500",
  letterSpacing: ".18em",
  lineHeight: "1.3",
  textTransform: "uppercase",
  color: "#8F8B86",
};

const heading: CSSProperties = {
  margin: "0",
  fontFamily: SERIF,
  fontWeight: "600",
  fontSize: "clamp(25px,3.4vw,30px)",
  lineHeight: "1.1",
  color: "#F6F1EA",
};

function PanelHead({ icon, label, title }: { icon: ReactNode; label: string; title: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
      <span aria-hidden="true" style={panelIcon}>
        {icon}
      </span>
      <div style={{ minWidth: "0" }}>
        <h3 style={heading}>{title}</h3>
        <p style={{ margin: "6px 0 0", ...monoSmall }}>{label}</p>
      </div>
    </div>
  );
}

const rowTop: CSSProperties = { padding: "16px 0", borderTop: "1px solid rgba(255,255,255,.07)" };
const rowLine: CSSProperties = { display: "flex", alignItems: "baseline", gap: "14px" };
const rowRank: CSSProperties = {
  flex: "none",
  width: "26px",
  fontFamily: MONO,
  fontSize: "13px",
  fontWeight: "500",
  lineHeight: "1.3",
  color: "#FF8A5B",
};
const rowName: CSSProperties = {
  flex: "1 1 auto",
  minWidth: "0",
  overflowWrap: "anywhere",
  fontSize: "16px",
  fontWeight: "500",
  lineHeight: "1.3",
  color: "#F6F1EA",
};
const rowCount: CSSProperties = {
  flex: "none",
  textAlign: "right",
  fontFamily: MONO,
  fontSize: "12.5px",
  lineHeight: "1.5",
  color: "#B7B3AD",
};
const quiet: CSSProperties = { margin: "0", fontSize: "16px", lineHeight: "1.5", color: "#B7B3AD" };

function Leaderboard({ dashboard }: { dashboard: RecruitmentDashboard }) {
  return (
    <div className="card rv vt" data-testid="data-recruitment-leaderboard" style={panel}>
      <span className="ringB" aria-hidden="true" />
      <PanelHead
        label="Clasament public"
        title="Recomandări confirmate"
        icon={
          <svg className="ico" viewBox="0 0 24 24" width="22" height="22">
            <circle cx="12" cy="8" r="6" />
            <path d="M15.5 12.9L17 22l-5-3-5 3 1.5-9.1" />
          </svg>
        }
      />
      {dashboard.leaderboard.length ? (
        <ol style={{ margin: "22px 0 0", padding: "0", listStyle: "none" }}>
          {dashboard.leaderboard.map((entry) => (
            <li key={`${entry.rank}-${entry.displayName}`} data-testid={`data-recruitment-rank-${entry.rank}`} style={rowTop}>
              <div style={rowLine}>
                <span style={rowRank}>{String(entry.rank).padStart(2, "0")}</span>
                <span style={rowName}>{entry.displayName}</span>
                <span style={rowCount}>
                  {fmt(entry.verifiedInviteCount)} confirmate
                  <br />
                  {fmt(entry.points)} puncte
                </span>
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <p style={{ ...quiet, margin: "22px 0 0", paddingTop: "16px", borderTop: "1px solid rgba(255,255,255,.07)" }}>
          Clasamentul va apărea când sunt disponibile rezultate.
        </p>
      )}
    </div>
  );
}

function Personal({ dashboard }: { dashboard: RecruitmentDashboard }) {
  const viewer = dashboard.viewer;
  const totals: Array<[label: string, value: number]> = viewer
    ? [
        ["Invitații create", viewer.createdInviteCount],
        ["Recomandări confirmate", viewer.verifiedInviteCount],
        ["Puncte", viewer.points],
      ]
    : [];

  return (
    <div className="card rv vt" data-testid="data-recruitment-viewer" style={panel}>
      <span className="ringB" aria-hidden="true" />
      <PanelHead
        label="Rezumatul tău"
        title={viewer?.displayName ?? "Invitațiile tale"}
        icon={
          <svg className="ico" viewBox="0 0 24 24" width="22" height="22">
            <path d="M14 19v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 2 17.5V19M8 11a3.2 3.2 0 1 0 0-6.4A3.2 3.2 0 0 0 8 11zM19 8v6M16 11h6" />
          </svg>
        }
      />
      {viewer ? (
        <>
          <div style={{ marginTop: "22px", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(120px,100%), 1fr))", gap: "16px" }}>
            {totals.map(([label, value]) => (
              <div key={label}>
                <span style={{ display: "block", fontSize: "14px", fontWeight: "500", lineHeight: "1.3", color: "#B7B3AD" }}>{label}</span>
                <p style={{ margin: "8px 0 0", fontFamily: SERIF, fontWeight: "600", fontSize: "44px", lineHeight: "1", color: "#F6F1EA" }}>
                  <Odometer value={value} kind="s" />
                </p>
              </div>
            ))}
          </div>
          <div style={{ marginTop: "22px", ...rowTop }}>
            <h4 style={{ margin: "0 0 4px", ...monoSmall }}>Persoane recomandate</h4>
            {viewer.invitees.length ? (
              <ul style={{ margin: "0", padding: "0", listStyle: "none" }}>
                {viewer.invitees.map((invitee, i) => (
                  <li
                    key={`${invitee.displayName}-${invitee.verifiedAt}-${i}`}
                    data-testid={`data-recruitment-invitee-${i}`}
                    style={{ display: "flex", justifyContent: "space-between", gap: "14px", padding: "10px 0", fontSize: "16px", lineHeight: "1.3", color: "#F6F1EA" }}
                  >
                    <span style={{ minWidth: "0", overflowWrap: "anywhere" }}>{invitee.displayName}</span>
                    <time
                      dateTime={invitee.verifiedAt}
                      style={{ flex: "none", fontFamily: MONO, fontSize: "12.5px", lineHeight: "1.5", color: "#B7B3AD" }}
                    >
                      {formatTimestamp(invitee.verifiedAt)}
                    </time>
                  </li>
                ))}
              </ul>
            ) : (
              <p style={{ ...quiet, paddingTop: "8px" }}>Nicio recomandare confirmată încă.</p>
            )}
          </div>
        </>
      ) : (
        <p style={{ ...quiet, margin: "22px 0 0", paddingTop: "16px", borderTop: "1px solid rgba(255,255,255,.07)" }}>
          Conectează-te prin linkul de verificare primit în Discord pentru a vedea rezumatul personal.
        </p>
      )}
    </div>
  );
}

function Inactive() {
  return (
    <div
      className="card rv vt"
      role="status"
      style={{
        flex: "1 1 360px",
        minWidth: "0",
        position: "relative",
        borderRadius: "16px",
        border: "1px dashed rgba(226,180,103,.4)",
        background: "linear-gradient(180deg,#15171B 0%,#0F1114 100%)",
        padding: "clamp(22px,3vw,30px)",
        boxSizing: "border-box",
      }}
    >
      <span className="hatch" aria-hidden="true" />
      <span className="ringB" aria-hidden="true" />
      <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
        <span
          className="lockW"
          aria-hidden="true"
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: "46px",
            height: "46px",
            borderRadius: "13px",
            border: "1px solid rgba(226,180,103,.3)",
            background: "rgba(226,180,103,.08)",
            color: "#E2B467",
          }}
        >
          <svg className="ico" viewBox="0 0 24 24" width="22" height="22">
            <rect x="5" y="11" width="14" height="9.5" rx="2.5" />
            <path className="lockSh" d="M8.5 11V8a3.5 3.5 0 0 1 7 0v3" />
          </svg>
        </span>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "8px",
            padding: "6px 12px",
            borderRadius: "999px",
            border: "1px solid rgba(255,255,255,.14)",
            background: "rgba(255,255,255,.04)",
            fontFamily: MONO,
            fontSize: "11px",
            fontWeight: "500",
            letterSpacing: ".16em",
            lineHeight: "1",
            textTransform: "uppercase",
            color: "#B7B3AD",
          }}
        >
          <span className="blink" aria-hidden="true" style={{ width: "7px", height: "7px", borderRadius: "50%", background: "#9A968F" }} />
          Inactiv
        </span>
      </div>
      <p style={{ position: "relative", margin: "22px 0 0", fontSize: "19px", fontWeight: "700", lineHeight: "1.45", color: "#F6F1EA" }}>
        Programul de recrutare nu este activ momentan.
      </p>
    </div>
  );
}

function Results({ view }: { view: RecruitmentView }) {
  const slot: CSSProperties = { flex: "1 1 360px", minWidth: "0" };
  switch (view.kind) {
    case "loading":
      return (
        <div style={slot} role="status" aria-label="Se încarcă datele programului de recrutare">
          <div className="skel" style={{ height: "190px" }} />
        </div>
      );
    case "profile-error":
      return (
        <div style={slot}>
          <StateCard
            tone="error"
            title="Programul de recrutare nu poate fi încărcat."
            action={{ label: "Încearcă din nou", onClick: view.retry, testId: "button-retry-recruitment-profile" }}
          />
        </div>
      );
    case "no-guild":
      return (
        <div style={slot}>
          <StateCard title="Programul de recrutare nu este disponibil pentru acest server." />
        </div>
      );
    case "error":
      return (
        <div style={slot}>
          <StateCard
            tone="error"
            title="Rezumatul recrutării nu este disponibil momentan."
            action={{ label: "Reîncarcă datele", onClick: view.retry, testId: "button-retry-recruitment" }}
          />
        </div>
      );
    case "inactive":
      return <Inactive />;
    case "active":
      return (
        <div style={{ ...slot, display: "flex", flexDirection: "column", gap: "16px" }}>
          <Leaderboard dashboard={view.dashboard} />
          <Personal dashboard={view.dashboard} />
        </div>
      );
    default:
      return (
        <div style={slot}>
          <StateCard title="Nu există date de recrutare disponibile momentan." />
        </div>
      );
  }
}

export function RecruitmentSection({ view }: { view: RecruitmentView }) {
  return (
    <section
      id="recrutare"
      aria-labelledby="h-recrutare"
      data-testid="section-recruitment"
      style={{ ...sectionBox, display: "flex", flexWrap: "wrap", alignItems: "center", gap: "40px 72px" }}
    >
      <div style={{ flex: "1 1 480px", minWidth: "0" }}>
        <Eyebrow>Recrutare comunitate</Eyebrow>
        <SectionTitle id="h-recrutare" first="O invitație poate deschide" second="un loc nou." />
        <Lede style={{ margin: "14px 0 0" }}>
          Un rezumat transparent al programului de recomandări al serverului. Clasamentul arată numai numele publice și rezultatele
          raportate.
        </Lede>
      </div>
      <Results view={view} />
    </section>
  );
}
