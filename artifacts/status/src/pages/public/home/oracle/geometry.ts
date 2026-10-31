/**
 * Forma ochiului Oracolului: runele inelului exterior (un singur contur, fiecare
 * rună rotită pe cerc) și razele din jurul irisului. Totul e calculat o dată,
 * la prima cerere, și apoi refolosit.
 */

// Conturul fiecărei rune, desenat într-un pătrat de 40 × 60.
const RUNES = [
  "M13 6V54M13 22L29 9M13 35L29 22",
  "M11 54V7L29 22V54",
  "M13 6V54M13 18L27 30L13 42",
  "M13 6V54M13 8L29 20M13 22L29 34",
  "M13 54V6L28 17L13 29L29 54",
  "M28 12L12 30L28 48",
  "M9 11L31 49M31 11L9 49",
  "M13 54V6L28 17L13 29",
  "M11 6V54M29 6V54M11 23L29 37",
  "M20 6V54M11 23L29 37",
  "M20 6V54",
  "M17 12L9 22L17 32M23 28L31 38L23 48",
  "M27 7L13 24L27 36L13 53",
  "M20 6V54M8 20L20 6L32 20",
  "M13 6V54M13 6L28 18L13 30L28 42L13 54",
  "M10 54V7L20 21L30 7V54",
  "M10 54V7L30 27M30 54V7L10 27",
  "M15 54V6L29 19",
  "M20 6L31 19L11 46M20 6L9 19L29 46",
  "M8 10V50L32 10V50Z",
];

/** Pune o rună pe inel, rotită cu `deg` grade, și o scrie ca drum SVG. */
export function placeRune(d: string, deg: number): string {
  const a = (deg * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  const P = (x: number, y: number) => {
    const qx = (x - 20) * 0.36;
    const qy = (y - 30) * 0.36 - 167;
    return (qx * c - qy * s).toFixed(1) + " " + (qx * s + qy * c).toFixed(1);
  };
  const tokens = d.match(/[MLVHZ]|-?\d*\.?\d+/gi) || [];
  let i = 0;
  let cmd = "";
  let x = 0;
  let y = 0;
  let sx = 0;
  let sy = 0;
  let out = "";
  while (i < tokens.length) {
    const t = tokens[i];
    if (/^[MLVHZ]$/i.test(t)) {
      cmd = t.toUpperCase();
      i++;
      if (cmd === "Z") {
        out += "Z";
        x = sx;
        y = sy;
      }
      continue;
    }
    if (cmd === "M" || cmd === "L") {
      x = Number(tokens[i]);
      y = Number(tokens[i + 1]);
      i += 2;
      out += (cmd === "M" ? "M" : "L") + P(x, y);
      if (cmd === "M") {
        sx = x;
        sy = y;
        cmd = "L";
      }
    } else if (cmd === "V") {
      y = Number(t);
      i++;
      out += "L" + P(x, y);
    } else if (cmd === "H") {
      x = Number(t);
      i++;
      out += "L" + P(x, y);
    } else {
      i++;
    }
  }
  return out;
}

export interface EyeGeometry {
  runesD: string;
  raysA: string;
  raysB: string;
  raysC: string;
}

let cached: EyeGeometry | null = null;

export function eyeGeometry(): EyeGeometry {
  if (cached) return cached;
  let runesD = "";
  for (let i = 0; i < 24; i++) runesD += placeRune(RUNES[(i * 7) % RUNES.length], i * 15);
  const rays = ["", "", ""];
  for (let i = 0; i < 36; i++) {
    const a = (i * 10 * Math.PI) / 180;
    const r1 = 70 + (i % 3) * 6;
    const r2 = 112 - (i % 2) * 8;
    rays[i % 3] +=
      "M" + (Math.cos(a) * r1).toFixed(1) + " " + (Math.sin(a) * r1).toFixed(1) +
      "L" + (Math.cos(a) * r2).toFixed(1) + " " + (Math.sin(a) * r2).toFixed(1);
  }
  cached = { runesD, raysA: rays[0], raysB: rays[1], raysC: rays[2] };
  return cached;
}
