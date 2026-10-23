import { trackEvent } from "../../../lib/analytics";
import crest from "./crest.webp";
import { ArrowOut, Eyebrow, Lede, SectionTitle, Sparks } from "./parts";
import type { Spark } from "./sparks";

export function InvitationSection({ invite, sparks }: { invite: string; sparks: Spark[] }) {
  return (
    <section
      id="intra"
      aria-labelledby="h-intra"
      style={{
        width: "100%",
        maxWidth: "1200px",
        margin: "0 auto",
        padding: "0 clamp(20px,5vw,56px) clamp(72px,10vw,120px)",
        boxSizing: "border-box",
      }}
    >
      <div className="gb" style={{ borderRadius: "24px", padding: "1px", boxShadow: "0 50px 100px -40px rgba(255,80,30,.35)" }}>
        <div
          style={{
            position: "relative",
            overflow: "hidden",
            isolation: "isolate",
            borderRadius: "23px",
            background:
              "radial-gradient(90% 110% at 50% 118%, rgba(255,90,40,.45) 0%, rgba(170,32,22,.22) 42%, rgba(17,18,22,0) 74%), linear-gradient(180deg,#121317 0%,#0D0E11 100%)",
            padding: "clamp(44px,7vw,96px) clamp(24px,5vw,80px)",
          }}
        >
          <span className="sun" aria-hidden="true" />
          <div aria-hidden="true" style={{ position: "absolute", inset: "0", zIndex: "0", pointerEvents: "none" }}>
            <Sparks items={sparks} />
          </div>
          <div
            style={{
              position: "relative",
              zIndex: "1",
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "40px 56px",
            }}
          >
            <div style={{ flex: "1 1 520px", minWidth: "0", maxWidth: "760px" }}>
              <Eyebrow>Început</Eyebrow>
              <SectionTitle
                id="h-intra"
                first="Intră fără grabă."
                second="Rămâi pentru oameni."
                style={{ fontSize: "clamp(36px,9.4vw,84px)", lineHeight: "1", letterSpacing: "-.012em" }}
                secondStyle={{ padding: ".04em 0 .14em" }}
              />
              <Lede style={{ margin: "14px 0 0", color: "#C2BEB8" }}>
                Începe cu un salut și explorează conversațiile care te atrag. Comunitatea e aici să te întâmpine, iar datele de mai sus îți oferă o
                imagine transparentă a ritmului ei.
              </Lede>
              <span className="ping" style={{ marginTop: "32px", maxWidth: "100%" }}>
                <a
                  className="btnP"
                  href={invite}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => trackEvent("discord_cta_click", { location: "server_guide_footer" })}
                  data-testid="link-server-guide-join-bottom"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "12px",
                    minHeight: "58px",
                    maxWidth: "100%",
                    padding: "12px 24px",
                    boxSizing: "border-box",
                    borderRadius: "12px",
                    background: "linear-gradient(135deg,#D24320 0%,#B3301B 55%,#8E2116 100%)",
                    boxShadow: "0 16px 40px -10px rgba(255,90,40,.8), inset 0 1px 0 rgba(255,255,255,.22)",
                    color: "#FFFFFF",
                    fontWeight: "700",
                    fontSize: "16px",
                    lineHeight: "1.25",
                    letterSpacing: ".01em",
                    textAlign: "center",
                    textDecoration: "none",
                  }}
                >
                  Deschide invitația Discord
                  <ArrowOut size={18} />
                </a>
              </span>
            </div>
            <div
              className="deskOnly"
              aria-hidden="true"
              style={{ position: "relative", flex: "none", width: "240px", height: "240px", margin: "0 auto" }}
            >
              <span
                style={{
                  position: "absolute",
                  inset: "-34px",
                  borderRadius: "50%",
                  background: "radial-gradient(closest-side, rgba(255,96,40,.42), rgba(160,30,20,.16) 62%, rgba(9,9,11,0))",
                  filter: "blur(10px)",
                }}
              />
              <span className="sonar" style={{ inset: "20px" }} />
              <span className="sonar s2" style={{ inset: "20px" }} />
              <span className="rune" style={{ inset: "-18px", borderColor: "rgba(226,180,103,.4)" }} />
              <span className="rune rune2" style={{ inset: "4px", borderStyle: "solid", borderColor: "rgba(255,138,91,.28)" }} />
              <img
                src={crest}
                alt=""
                width="200"
                height="200"
                style={{
                  position: "absolute",
                  left: "20px",
                  top: "20px",
                  display: "block",
                  width: "200px",
                  height: "200px",
                  borderRadius: "50%",
                  boxShadow: "0 0 0 1px rgba(226,180,103,.7), 0 0 60px 8px rgba(255,107,61,.35)",
                }}
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
