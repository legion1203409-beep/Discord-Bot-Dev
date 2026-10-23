/**
 * Scânteile și cenușa din fundalul paginii „Autentificare operator”. Pozițiile
 * vin dintr-o sămânță fixă (aceeași ca în design), deci pagina arată la fel la
 * fiecare vizită, nu sare la fiecare randare.
 */
import { makeRng } from "../../public/home/sparks";

export interface GateEmber {
  cls: string;
  left: string;
  bottom: string;
  size: string;
  dur: string;
  delay: string;
}

export interface GateAsh {
  left: string;
  top: string;
  size: string;
  dur: string;
  delay: string;
  sw: string;
  o: string;
}

export interface GateAmbience {
  /** Scânteile din fundal (26). */
  embers: GateEmber[];
  /** Cenușa care cade (20). */
  ashes: GateAsh[];
  /** Scânteile mari din prim-plan (7), ținute pe margini. */
  foreground: GateEmber[];
}

type Rng = () => number;

/**
 * `big`: scântei mari, în prim-plan, ținute pe margini ca să nu treacă peste
 * textul cardurilor.
 */
function embers(rnd: Rng, n: number, big: boolean): GateEmber[] {
  const out: GateEmber[] = [];
  for (let i = 0; i < n; i++) {
    const x = big ? (i % 2 ? 84 + rnd() * 14 : 2 + rnd() * 14) : rnd() * 100;
    out.push({
      cls: "emb " + ["ea", "eb", "ec"][i % 3],
      left: x.toFixed(2) + "%",
      bottom: (rnd() * 30 - 8).toFixed(1) + "%",
      size: (big ? 5 + rnd() * 4 : 2 + rnd() * 4).toFixed(1) + "px",
      dur: (big ? 7 + rnd() * 5 : 8 + rnd() * 9).toFixed(2) + "s",
      delay: "-" + (rnd() * 17).toFixed(2) + "s",
    });
  }
  return out;
}

function ashes(rnd: Rng, n: number): GateAsh[] {
  const out: GateAsh[] = [];
  for (let i = 0; i < n; i++) {
    out.push({
      left: (rnd() * 100).toFixed(2) + "%",
      top: (rnd() * 100 - 6).toFixed(1) + "%",
      size: (1.4 + rnd() * 2.6).toFixed(1) + "px",
      dur: (16 + rnd() * 18).toFixed(2) + "s",
      delay: "-" + (rnd() * 30).toFixed(2) + "s",
      sw: Math.round((rnd() * 2 - 1) * 46) + "px",
      o: (0.35 + rnd() * 0.5).toFixed(2),
    });
  }
  return out;
}

/** Ordinea apelurilor contează: toate folosesc același șir de numere. */
export function buildGateAmbience(seed = 2026): GateAmbience {
  const rnd = makeRng(seed);
  const back = embers(rnd, 26, false);
  const ash = ashes(rnd, 20);
  const foreground = embers(rnd, 7, true);
  return { embers: back, ashes: ash, foreground };
}
