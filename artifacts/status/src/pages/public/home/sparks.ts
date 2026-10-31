/**
 * Scânteile care urcă și cenușa care cade. Pozițiile sunt calculate o singură
 * dată dintr-o sămânță fixă, ca pagina să arate la fel la fiecare vizită
 * (și ca în design), nu să sară la fiecare randare.
 */

export interface Spark {
  cls: string;
  left: string;
  bottom: string;
  size: string;
  dur: string;
  delay: string;
}

export interface Ash {
  left: string;
  top: string;
  size: string;
  dur: string;
  delay: string;
  sw: string;
  o: string;
}

export function makeRng(seed: number): () => number {
  let s = seed;
  return () => {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Rng = () => number;

function sparks(rnd: Rng, n: number): Spark[] {
  const out: Spark[] = [];
  for (let i = 0; i < n; i++) {
    out.push({
      cls: "emb " + ["ea", "eb", "ec"][i % 3],
      left: (rnd() * 100).toFixed(2) + "%",
      bottom: (rnd() * 34 - 6).toFixed(1) + "%",
      size: (2 + rnd() * 4).toFixed(1) + "px",
      dur: (8 + rnd() * 9).toFixed(2) + "s",
      delay: "-" + (rnd() * 17).toFixed(2) + "s",
    });
  }
  return out;
}

function ashes(rnd: Rng, n: number): Ash[] {
  const out: Ash[] = [];
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

export interface Ambience {
  /** Scânteile din antet (38). */
  hero: Spark[];
  /** Scânteile din secțiunea finală (16). */
  invitation: Spark[];
  /** Cenușa din antet (22). */
  ashes: Ash[];
  /** Scânteile din jurul ochiului Oracolului (12). */
  oracle: Spark[];
}

/** Ordinea apelurilor contează: toate folosesc același șir de numere. */
export function buildAmbience(seed = 1014): Ambience {
  const rnd = makeRng(seed);
  const hero = sparks(rnd, 38);
  const invitation = sparks(rnd, 16);
  const ash = ashes(rnd, 22);
  const oracle = sparks(rnd, 12);
  return { hero, invitation, ashes: ash, oracle };
}
