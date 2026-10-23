import type { CSSProperties, ReactNode } from "react";
import type { DailyStatsResponse } from "../../../hooks/public/use-daily-stats";
import { fmt, formatReportDay } from "./format";
import { Eyebrow, Lede, MONO, Odometer, SERIF, SectionTitle, StateCard, sectionBox } from "./parts";

type MetricKey = "messages" | "uniqueUsers" | "joins" | "leaves" | "boosts" | "peakVoice";

const TILES: Array<{ key: MetricKey; label: string; icon: string; anim: string; typing?: boolean; eq?: boolean }> = [
  { key: "messages", label: "Mesaje", icon: "M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z", anim: "ta-msg", typing: true },
  {
    key: "uniqueUsers",
    label: "Membri activi",
    icon: "M16 19v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 17.5V19M10 11a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4zM20 19v-1.5a3.5 3.5 0 0 0-2.6-3.4M15.5 4.7a3.2 3.2 0 0 1 0 6.2",
    anim: "ta-users",
  },
  {
    key: "joins",
    label: "Membri noi",
    icon: "M14 19v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 2 17.5V19M8 11a3.2 3.2 0 1 0 0-6.4A3.2 3.2 0 0 0 8 11zM19 8v6M16 11h6",
    anim: "ta-join",
  },
  {
    key: "leaves",
    label: "Plecări",
    icon: "M14 19v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 2 17.5V19M8 11a3.2 3.2 0 1 0 0-6.4A3.2 3.2 0 0 0 8 11zM16 11h6",
    anim: "ta-leave",
  },
  { key: "boosts", label: "Boost-uri", icon: "M13 3L5 13.5h6L10 21l8-10.5h-6L13 3z", anim: "ta-boost" },
  {
    key: "peakVoice",
    label: "Vârf vocal",
    icon: "M11 5L6 9H3v6h3l5 4V5zM15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13",
    anim: "ta-voice",
    eq: true,
  },
];

const monoSmall: CSSProperties = {
  fontFamily: MONO,
  fontSize: "11px",
  fontWeight: "500",
  letterSpacing: ".18em",
  lineHeight: "1.3",
  textTransform: "uppercase",
  color: "#8F8B86",
};

const gridBox: CSSProperties = {
  marginTop: "clamp(32px,5vw,48px)",
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(min(150px,100%), 1fr))",
  gap: "12px",
};

interface DailyState {
  data: DailyStatsResponse | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function ReportSection({ daily }: { daily: DailyState }) {
  const { data, loading, error, refresh } = daily;
  const report = data?.report;
  const metrics = report?.metrics;
  const channels = report?.topChannels ?? [];
  const channelMax = Math.max(1, ...channels.map((c) => c.messages));

  let body: ReactNode;
  if (loading && !data) {
    body = (
      <div style={gridBox} role="status" aria-label="Se încarcă raportul zilnic">
        {TILES.map((t) => (
          <div key={t.key} className="skel" style={{ height: "128px" }} />
        ))}
      </div>
    );
  } else if (error) {
    body = (
      <div style={{ marginTop: "clamp(32px,5vw,48px)" }}>
        <StateCard
          tone="error"
          title="Raportul zilnic nu este disponibil."
          detail={error}
          action={{ label: "Încearcă din nou", onClick: () => void refresh(), testId: "button-retry-server-report" }}
        />
      </div>
    );
  } else if (report && data && metrics) {
    body = (
      <>
        <div style={gridBox} data-testid="data-daily-metrics">
          {TILES.map((t) => (
            <div
              key={t.key}
              className="tile rv vt"
              data-testid={`data-daily-${t.key}`}
              style={{
                position: "relative",
                display: "flex",
                flexDirection: "column",
                overflow: "hidden",
                borderRadius: "16px",
                border: "1px solid rgba(255,255,255,.08)",
                background: "linear-gradient(180deg,#16181C 0%,#101215 100%)",
                padding: "18px 18px 20px",
                boxSizing: "border-box",
              }}
            >
              <span className="ringB" aria-hidden="true" />
              <span
                aria-hidden="true"
                style={{
                  position: "absolute",
                  left: "16px",
                  right: "16px",
                  top: "0",
                  height: "1px",
                  background: "linear-gradient(90deg, rgba(226,180,103,0), rgba(226,180,103,.6), rgba(226,180,103,0))",
                }}
              />
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "10px" }}>
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "4px 8px",
                    flexWrap: "wrap",
                    fontSize: "14px",
                    fontWeight: "500",
                    lineHeight: "1.3",
                    color: "#B7B3AD",
                  }}
                >
                  {t.label}
                  {t.typing ? (
                    <span className="typ" aria-hidden="true">
                      <i />
                      <i />
                      <i />
                    </span>
                  ) : null}
                </span>
                <span
                  className={t.anim}
                  aria-hidden="true"
                  style={{
                    flex: "none",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: "34px",
                    height: "34px",
                    borderRadius: "10px",
                    border: "1px solid rgba(226,180,103,.24)",
                    background: "rgba(226,180,103,.09)",
                    color: "#E2B467",
                  }}
                >
                  <svg className="ico" viewBox="0 0 24 24" width="18" height="18">
                    <path d={t.icon} />
                  </svg>
                </span>
              </div>
              <div style={{ marginTop: "auto", paddingTop: "16px", display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: "10px" }}>
                <p
                  style={{
                    margin: "0",
                    fontFamily: SERIF,
                    fontWeight: "600",
                    fontSize: "clamp(44px,11vw,56px)",
                    lineHeight: "1",
                    color: "#F6F1EA",
                  }}
                >
                  <Odometer value={metrics[t.key]} kind="s" />
                </p>
                {t.eq ? (
                  <span className="eq" aria-hidden="true">
                    <i />
                    <i />
                    <i />
                    <i />
                    <i />
                  </span>
                ) : null}
              </div>
            </div>
          ))}
        </div>

        <div
          className="card rv vt"
          style={{
            position: "relative",
            marginTop: "16px",
            borderRadius: "16px",
            border: "1px solid rgba(255,255,255,.08)",
            background: "linear-gradient(180deg,#16181C 0%,#101215 100%)",
            padding: "clamp(20px,3vw,30px)",
            boxSizing: "border-box",
          }}
        >
          <span className="ringB" aria-hidden="true" />
          <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
            <span
              aria-hidden="true"
              style={{
                flex: "none",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: "46px",
                height: "46px",
                borderRadius: "13px",
                border: "1px solid rgba(226,180,103,.3)",
                background: "rgba(226,180,103,.09)",
                fontFamily: SERIF,
                fontWeight: "700",
                fontSize: "28px",
                lineHeight: "1",
                color: "#E2B467",
              }}
            >
              #
            </span>
            <div style={{ minWidth: "0" }}>
              <h3
                style={{
                  margin: "0",
                  fontFamily: SERIF,
                  fontWeight: "600",
                  fontSize: "clamp(25px,3.4vw,30px)",
                  lineHeight: "1.1",
                  color: "#F6F1EA",
                }}
              >
                Canale active în ziua raportată
              </h3>
              <p style={{ margin: "6px 0 0", ...monoSmall }}>{data.guildName || "Regatul Cenușii"}</p>
            </div>
          </div>

          {channels.length ? (
            <ol style={{ margin: "22px 0 0", padding: "0", listStyle: "none" }}>
              {channels.map((channel, i) => (
                <li
                  key={channel.channelId}
                  data-testid={`data-top-channel-${channel.channelId}`}
                  style={{ padding: "16px 0", borderTop: "1px solid rgba(255,255,255,.07)" }}
                >
                  <div style={{ display: "flex", alignItems: "baseline", gap: "14px" }}>
                    <span
                      style={{
                        flex: "none",
                        width: "26px",
                        fontFamily: MONO,
                        fontSize: "13px",
                        fontWeight: "500",
                        lineHeight: "1.3",
                        color: "#FF8A5B",
                      }}
                    >
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span
                      style={{
                        flex: "1 1 auto",
                        minWidth: "0",
                        overflowWrap: "anywhere",
                        fontSize: "16px",
                        fontWeight: "500",
                        lineHeight: "1.3",
                        color: "#F6F1EA",
                      }}
                    >
                      <span style={{ color: "#8F8B86" }}>#</span>
                      {channel.channelName}
                    </span>
                    <span
                      style={{
                        flex: "none",
                        whiteSpace: "nowrap",
                        fontFamily: MONO,
                        fontSize: "12.5px",
                        lineHeight: "1.3",
                        color: "#B7B3AD",
                      }}
                    >
                      {fmt(channel.messages) + (channel.messages === 1 ? " mesaj" : " mesaje")}
                    </span>
                  </div>
                  <div
                    aria-hidden="true"
                    style={{ margin: "12px 0 0 40px", height: "6px", borderRadius: "999px", background: "rgba(255,255,255,.06)", overflow: "hidden" }}
                  >
                    <div
                      className="bar"
                      style={{
                        width: Math.max(1.5, (channel.messages / channelMax) * 100).toFixed(2) + "%",
                        minWidth: "6px",
                        height: "100%",
                        borderRadius: "999px",
                        background: "linear-gradient(90deg,#FF6B3D,#FFB45E)",
                        boxShadow: "0 0 10px rgba(255,107,61,.7)",
                      }}
                    />
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <p style={{ margin: "22px 0 0", padding: "16px 0", borderTop: "1px solid rgba(255,255,255,.07)", fontSize: "16px", lineHeight: "1.5", color: "#B7B3AD" }}>
              Nu există canale cu mesaje înregistrate pentru ziua raportată.
            </p>
          )}

          <p
            style={{
              margin: "0",
              paddingTop: "16px",
              borderTop: "1px solid rgba(255,255,255,.07)",
              fontFamily: MONO,
              fontSize: "12px",
              lineHeight: "1.4",
              color: "#8F8B86",
            }}
          >
            Fusul orar al raportului: {data.timezone}
          </p>
        </div>
      </>
    );
  } else {
    body = (
      <div style={{ marginTop: "clamp(32px,5vw,48px)" }}>
        <StateCard
          title="Nu există un raport zilnic disponibil."
          action={{ label: "Reîncarcă raportul", onClick: () => void refresh(), testId: "button-refresh-server-report" }}
        />
      </div>
    );
  }

  return (
    <section id="raport" aria-labelledby="h-raport" style={sectionBox}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", justifyContent: "space-between", gap: "24px 48px" }}>
        <div style={{ flex: "1 1 520px", minWidth: "0", maxWidth: "720px" }}>
          <Eyebrow>Activitate raportată</Eyebrow>
          <SectionTitle id="h-raport" first="O zi din comunitate." />
          <Lede>Indicatorii de mai jos aparțin zilei raportate, nu sunt un numărător live.</Lede>
        </div>
        {report ? (
          <p
            style={{
              margin: "0",
              display: "inline-flex",
              alignItems: "center",
              gap: "12px",
              padding: "12px 18px",
              borderRadius: "12px",
              border: "1px solid rgba(226,180,103,.3)",
              background: "rgba(226,180,103,.06)",
              fontFamily: MONO,
              fontSize: "14px",
              fontWeight: "500",
              lineHeight: "1.2",
              color: "#F3D08E",
            }}
          >
            <svg className="ico" aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" style={{ flex: "none", color: "#E2B467" }}>
              <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
              <path d="M3.5 10h17M8 3v4M16 3v4" />
            </svg>
            <time dateTime={report.day} data-testid="data-report-day">
              {formatReportDay(report.day)}
            </time>
          </p>
        ) : null}
      </div>
      {body}
    </section>
  );
}
