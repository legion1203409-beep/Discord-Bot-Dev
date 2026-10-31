import { Fragment } from "react";

/** Cele două benzi de cuvinte care derulează sub antet. */
type Word = [text: string, style: "" | "e" | "o"];

const ROW_ONE: Word[] = [
  ["Conversații", ""],
  ["Întâlniri", "e"],
  ["Oameni care revin", ""],
  ["Povești", "e"],
  ["Comunitate românească", ""],
  ["În ritmul tău", "e"],
];

const ROW_TWO: Word[] = [
  ["Intră fără grabă", "o"],
  ["Rămâi pentru oameni", "o"],
  ["Fără tron, doar povești", "o"],
  ["Oracolul Cenușii", "e"],
  ["Regatul Cenușii", "o"],
  ["Fă cunoștință", "o"],
];

/** Jumătatea se repetă o dată, ca derularea să se închidă fără sărituri. */
function doubled(words: Word[]) {
  return words.concat(words).map(([text, style]) => ({ text, cls: "mqW" + (style ? " " + style : "") }));
}

function Row({ words, reverse }: { words: Word[]; reverse?: boolean }) {
  return (
    <div className={reverse ? "mqRow rev" : "mqRow"}>
      <div className="mqTrack">
        {doubled(words).map((w, i) => (
          <Fragment key={i}>
            <span className={w.cls}>{w.text}</span>
            <span className="mqD" />
          </Fragment>
        ))}
      </div>
    </div>
  );
}

export function Marquee() {
  return (
    <div className="mqBand" aria-hidden="true">
      <Row words={ROW_ONE} />
      <Row words={ROW_TWO} reverse />
    </div>
  );
}
