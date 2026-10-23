import { Eyebrow, Lede, SectionTitle, Sparks, sectionBox } from "../parts";
import type { Spark } from "../sparks";
import type { OracleFacts } from "./archive";
import { OracleChat } from "./OracleChat";
import { OracleEye } from "./OracleEye";
import { useOracleChat } from "./useOracleChat";

/** „Întreabă Oracolul”: ochiul care urmărește cursorul și chatul cu arhiva. */
export function OracleSection({ facts, sparks }: { facts: OracleFacts; sparks: Spark[] }) {
  const chat = useOracleChat(facts);

  return (
    <section id="oracol" className="orc" aria-labelledby="h-oracol" data-testid="section-oracle" style={sectionBox}>
      <div style={{ maxWidth: "720px" }}>
        <Eyebrow>Botul regatului</Eyebrow>
        <SectionTitle id="h-oracol" first="Întreabă Oracolul." second="Vede prin cenușă." />
        <Lede>
          Oracolul Cenușii este botul serverului: păzește regatul, ține jocul RPG și le răspunde membrilor. Întreabă-l despre comunitate,
          despre ce știe să facă sau cere-i o profeție.
        </Lede>
      </div>

      <div style={{ marginTop: "clamp(32px,5vw,48px)", display: "flex", flexWrap: "wrap", alignItems: "stretch", gap: "20px" }}>
        <div
          className="orcStage"
          style={{
            flex: "1 1 380px",
            minWidth: "0",
            minHeight: "clamp(320px,40vw,560px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "clamp(20px,3vw,36px)",
            boxSizing: "border-box",
            borderRadius: "24px",
            border: "1px solid rgba(226,180,103,.18)",
            background: "linear-gradient(180deg,#121317 0%,#0D0E11 100%)",
            overflow: "hidden",
          }}
        >
          <div aria-hidden="true" style={{ position: "absolute", inset: "0", zIndex: "0", pointerEvents: "none" }}>
            <Sparks items={sparks} />
          </div>
          <OracleEye busy={chat.busy} spoke={chat.spoke} />
        </div>
        <OracleChat chat={chat} />
      </div>
    </section>
  );
}
