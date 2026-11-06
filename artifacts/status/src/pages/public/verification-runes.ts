/** Runele de bun venit de după verificare. Doar pentru distracție: nu schimbă nimic pe server. */
export type WelcomeRune = { id: string; glyph: string; name: string; title: string; prophecy: string };

export const WELCOME_RUNES: readonly WelcomeRune[] = [
  { id: "fehu", glyph: "ᚠ", name: "Fehu", title: "Purtătorul de Jar", prophecy: "Aduci noroc unde intri. Primul tău mesaj o să aprindă o conversație lungă." },
  { id: "uruz", glyph: "ᚢ", name: "Uruz", title: "Taurul din Cenușă", prophecy: "Ai putere de rezervă. Când alții obosesc, tu abia te încălzești." },
  { id: "thurisaz", glyph: "ᚦ", name: "Thurisaz", title: "Spărgătorul de Porți", prophecy: "Nu aștepți invitații. Regatul o să te audă înainte să te vadă." },
  { id: "ansuz", glyph: "ᚨ", name: "Ansuz", title: "Glasul Oracolului", prophecy: "Vorbele tale cântăresc. Un sfat dat azi o să fie ținut minte mult timp." },
  { id: "raidho", glyph: "ᚱ", name: "Raidho", title: "Călătorul de Fum", prophecy: "Drumul tău prin regat abia începe. Fiecare canal e o hartă nouă." },
  { id: "kenaz", glyph: "ᚲ", name: "Kenaz", title: "Făclia din Întuneric", prophecy: "Luminezi locurile uitate. Cineva o să te caute exact pentru asta." },
  { id: "gebo", glyph: "ᚷ", name: "Gebo", title: "Legătorul de Prietenii", prophecy: "Un dar se întoarce mereu. Un prieten nou te așteaptă pe voce." },
  { id: "wunjo", glyph: "ᚹ", name: "Wunjo", title: "Vestitorul Bucuriei", prophecy: "Unde râzi tu, se adună lumea. Pregătește-ți cele mai bune glume." },
  { id: "hagalaz", glyph: "ᚺ", name: "Hagalaz", title: "Furtuna Liniștită", prophecy: "Treci prin haos fără să te zgârii. Ceilalți o să vrea să afle cum." },
  { id: "isa", glyph: "ᛁ", name: "Isa", title: "Paznicul de Gheață", prophecy: "Răbdarea ta e o armă. Cine așteaptă focul, îl primește întreg." },
  { id: "sowilo", glyph: "ᛊ", name: "Sowilo", title: "Fiul Soarelui Stins", prophecy: "Urci repede. Peste câteva zile, numele tău o să apară în top." },
  { id: "othala", glyph: "ᛟ", name: "Othala", title: "Moștenitorul Regatului", prophecy: "Ai venit acasă. Locul ăsta o să fie al tău cât timp îl păstrezi viu." },
];

const KEY = "oracol.welcomeRune";

/** Runa trasă deja pe acest dispozitiv, ca să nu se schimbe la reîncărcare. */
export function savedRune(guildId: string | undefined): WelcomeRune | null {
  try {
    const id = window.localStorage.getItem(`${KEY}.${guildId ?? "any"}`);
    return WELCOME_RUNES.find((rune) => rune.id === id) ?? null;
  } catch {
    return null;
  }
}

export function saveRune(guildId: string | undefined, rune: WelcomeRune): void {
  try {
    window.localStorage.setItem(`${KEY}.${guildId ?? "any"}`, rune.id);
  } catch {
    /* storage may be blocked: the rune just won't be remembered */
  }
}

/** Trei rune diferite pentru cele trei cărți întoarse. */
export function drawThree(random: () => number = Math.random): WelcomeRune[] {
  const pool = [...WELCOME_RUNES];
  for (let index = pool.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1));
    [pool[index], pool[other]] = [pool[other], pool[index]];
  }
  return pool.slice(0, 3);
}

export function runeShareText(rune: WelcomeRune): string {
  return `${rune.glyph} Am tras runa ${rune.name} în Regatul Cenușii: sunt „${rune.title}”. ${rune.prophecy}`;
}

export function discordServerUrl(guildId: string | undefined | null): string | null {
  return guildId && /^\d{17,20}$/.test(guildId) ? `https://discord.com/channels/${guildId}` : null;
}
