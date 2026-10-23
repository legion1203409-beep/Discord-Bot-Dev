/**
 * Piesele mici pe care le folosesc mai multe secțiuni ale paginii principale:
 * fonturile, titlurile cu mască, separatorul, odometrul și scânteile.
 * Stilurile în linie sunt cele din design; clasele vin din `home.css`.
 */
import type { CSSProperties, ReactNode } from "react";
import { fmt, odometerColumns } from "./format";
import type { Ash, Spark } from "./sparks";

export const SERIF = "'Cormorant Garamond','Cormorant',Georgia,serif";
export const MONO = "'JetBrains Mono',ui-monospace,monospace";

/** Încadrarea unei secțiuni: lățime maximă și umplutura verticală din design. */
export const sectionBox: CSSProperties = {
  width: "100%",
  maxWidth: "1200px",
  margin: "0 auto",
  padding: "clamp(72px,10vw,120px) clamp(20px,5vw,56px)",
  boxSizing: "border-box",
};

const eyebrowStyle: CSSProperties = {
  margin: "0",
  display: "flex",
  alignItems: "center",
  gap: "14px",
  fontFamily: MONO,
  fontSize: "12px",
  fontWeight: "500",
  letterSpacing: ".2em",
  lineHeight: "1.4",
  textTransform: "uppercase",
  color: "#E2B467",
};

const eyebrowLine: CSSProperties = {
  flex: "none",
  width: "32px",
  height: "1px",
  background: "linear-gradient(90deg,#E2B467,rgba(226,180,103,.15))",
};

/** Eticheta mică de deasupra titlului, cu linia aurie care se trage la intrare. */
export function Eyebrow({
  children,
  lineClass = "labL",
  textClass,
}: {
  children: ReactNode;
  lineClass?: string;
  textClass?: string;
}) {
  return (
    <p style={eyebrowStyle}>
      <span className={lineClass} aria-hidden="true" style={eyebrowLine} />
      <span className={textClass}>{children}</span>
    </p>
  );
}

const titleStyle: CSSProperties = {
  margin: "18px 0 0",
  fontFamily: SERIF,
  fontWeight: "600",
  fontSize: "clamp(40px,9.6vw,68px)",
  lineHeight: "1.02",
  letterSpacing: "-.01em",
  color: "#F6F1EA",
};

/**
 * Titlu de secțiune: fiecare rând urcă de sub o mască când intră în ecran.
 * Al doilea rând (opțional) e cel cu gradientul de jar.
 */
export function SectionTitle({
  id,
  first,
  second,
  style,
  secondStyle = { paddingBottom: ".12em" },
}: {
  id: string;
  first: string;
  second?: string;
  style?: CSSProperties;
  secondStyle?: CSSProperties;
}) {
  return (
    <h2 id={id} style={{ ...titleStyle, ...style }}>
      <span className="mask">
        <span className="mi sv">{first}</span>
      </span>
      {second ? (
        <span className="mask">
          <span className="mi sv sv2">
            <span className="emberText" style={{ display: "block", ...secondStyle }}>
              {second}
            </span>
          </span>
        </span>
      ) : null}
    </h2>
  );
}

/** Paragraful de sub titlu. */
export function Lede({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <p
      style={{
        margin: "18px 0 0",
        maxWidth: "34em",
        fontSize: "clamp(17px,1.5vw,19px)",
        lineHeight: "1.7",
        color: "#B7B3AD",
        ...style,
      }}
    >
      {children}
    </p>
  );
}

/** Linia cu romb între secțiuni. */
export function Divider() {
  return (
    <div
      aria-hidden="true"
      style={{
        width: "100%",
        maxWidth: "1200px",
        margin: "0 auto",
        padding: "0 clamp(20px,5vw,56px)",
        boxSizing: "border-box",
        display: "flex",
        alignItems: "center",
        gap: "14px",
      }}
    >
      <span
        className="dvL"
        style={{ flex: "1 1 0", height: "1px", background: "linear-gradient(90deg, rgba(226,180,103,0), rgba(226,180,103,.4))" }}
      />
      <span
        className="dvD"
        style={{
          flex: "none",
          width: "7px",
          height: "7px",
          transform: "rotate(45deg)",
          border: "1px solid rgba(226,180,103,.8)",
          boxShadow: "0 0 12px rgba(226,180,103,.45)",
        }}
      />
      <span
        className="dvR"
        style={{ flex: "1 1 0", height: "1px", background: "linear-gradient(90deg, rgba(226,180,103,.4), rgba(226,180,103,0))" }}
      />
    </div>
  );
}

/** Punctul verde care pulsează; devine gri și nemișcat când datele nu sunt live. */
export function LiveDot({ live = true }: { live?: boolean }) {
  return <span className={live ? "live" : "live off"} aria-hidden="true" />;
}

/**
 * Un număr ca odometru: cifrele se rotesc până la valoare. Pentru cititoarele
 * de ecran se citește numărul întreg; fără date apare o liniuță.
 *   t = pornește la încărcare, s = pornește la derulare.
 */
export function Odometer({ value, kind }: { value: number | null | undefined; kind: "t" | "s" | "s g" }) {
  if (value == null || !Number.isFinite(value)) {
    return (
      <>
        <span className="sr">Indisponibil</span>
        <span aria-hidden="true" style={{ opacity: 0.35 }}>
          —
        </span>
      </>
    );
  }
  const text = fmt(Math.round(value));
  return (
    <>
      <span className="sr">{text}</span>
      <span className={`odw ${kind}`} aria-hidden="true">
        {odometerColumns(text).map((c, i) =>
          c.kind === "digit" ? (
            <span key={i} className="od" style={{ "--oc-d": c.digit, "--oc-k": c.index } as CSSProperties} />
          ) : (
            <span key={i} className="ods">
              {c.text}
            </span>
          ),
        )}
      </span>
    </>
  );
}

/** Scânteile care urcă (poziții fixe, calculate o singură dată). */
export function Sparks({ items }: { items: Spark[] }) {
  return (
    <>
      {items.map((p, i) => (
        <span
          key={i}
          className={p.cls}
          style={{ left: p.left, bottom: p.bottom, width: p.size, height: p.size, animationDuration: p.dur, animationDelay: p.delay }}
        />
      ))}
    </>
  );
}

/** Cenușa care cade încet. */
export function Ashes({ items }: { items: Ash[] }) {
  return (
    <>
      {items.map((a, i) => (
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
              "--oc-sw": a.sw,
              "--oc-o": a.o,
            } as CSSProperties
          }
        />
      ))}
    </>
  );
}

/** Săgeata în diagonală din butoanele spre Discord. */
export function ArrowOut({ size }: { size: number }) {
  return (
    <svg className="ico" aria-hidden="true" viewBox="0 0 24 24" width={size} height={size} style={{ flex: "none" }}>
      <path d="M7 17L17 7M8.5 7H17v8.5" />
    </svg>
  );
}

/** Starea pe care o ia o secțiune când datele se încarcă, lipsesc sau au dat eroare. */
export function StateCard({
  tone = "neutral",
  title,
  detail,
  action,
  role,
}: {
  tone?: "neutral" | "error";
  title: string;
  detail?: string;
  action?: { label: string; onClick: () => void; testId: string };
  role?: "status" | "alert";
}) {
  return (
    <div className={tone === "error" ? "state err" : "state"} role={role ?? (tone === "error" ? "alert" : "status")}>
      <strong>{title}</strong>
      {detail ? <span>{detail}</span> : null}
      {action ? (
        <button type="button" onClick={action.onClick} data-testid={action.testId}>
          {action.label}
        </button>
      ) : null}
    </div>
  );
}
