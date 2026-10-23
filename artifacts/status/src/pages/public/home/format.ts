/** Numerele din pagină se scriu cu punct la mii: 1.014, nu 1,014 și nu 1014. */
export function fmt(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

/**
 * „de” apare în română după numeralele de la 20 în sus, dar numai dacă ultimele
 * două cifre sunt 00 sau 20–99: „20 de mesaje”, „100 de mesaje”, „1.020 de membri”,
 * dar „101 mesaje”, „119 mesaje”, „1.014 membri”. Sub 20 (și la zero) nu apare.
 */
export function countLabel(n: number, one: string, many: string): string {
  if (n === 1) return `1 ${one}`;
  const lastTwo = n % 100;
  const needsDe = n >= 20 && (lastTwo === 0 || lastTwo >= 20);
  return `${fmt(n)} ${needsDe ? "de " : ""}${many}`;
}

/** Ziua raportului ca în pagină: „21 octombrie 2026”. */
export function formatReportDay(day: string): string {
  const parsed = new Date(`${day}T12:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return day;
  return new Intl.DateTimeFormat("ro-RO", { dateStyle: "long", timeZone: "UTC" }).format(parsed);
}

export type OdometerColumn =
  | { kind: "digit"; digit: number; index: number }
  | { kind: "separator"; text: string };

/**
 * Coloanele odometrului: fiecare cifră e o coloană care se rotește până la
 * valoarea ei (cu `index` pentru ordinea de pornire), restul caracterelor
 * (punctul de la mii) rămân pe loc.
 */
export function odometerColumns(text: string): OdometerColumn[] {
  let index = 0;
  return Array.from(String(text), (ch) =>
    /\d/.test(ch)
      ? ({ kind: "digit", digit: Number(ch), index: index++ } as const)
      : ({ kind: "separator", text: ch } as const),
  );
}

/** Data unei recomandări confirmate: „21 oct. 2026”. */
export function formatTimestamp(timestamp: string): string {
  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.getTime())) return timestamp;
  return new Intl.DateTimeFormat("ro-RO", { dateStyle: "medium" }).format(parsed);
}
