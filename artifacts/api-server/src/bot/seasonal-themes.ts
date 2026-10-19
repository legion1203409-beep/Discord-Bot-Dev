export type SeasonalAiTheme = "halloween" | "christmas" | null;

export function getSeasonalAiTheme(date = new Date()): SeasonalAiTheme {
  const month = date.getUTCMonth() + 1;
  const day = date.getUTCDate();
  if (month === 10) return "halloween";
  if (month === 12 || (month === 1 && day <= 6)) return "christmas";
  return null;
}

export function getSeasonalAiThemeInstruction(date = new Date()): string | null {
  switch (getSeasonalAiTheme(date)) {
    case "halloween":
      return "Este luna octombrie: adaugă discret o atmosferă veselă de Halloween, cu elemente precum dovleci, frunze de toamnă sau fantome prietenoase. Păstrează mesajul cald și potrivit comunității; fără amenințări sau groază intensă.";
    case "christmas":
      return "Este perioada Crăciunului: adaugă discret o atmosferă caldă de sărbătoare, cu lumini, zăpadă sau urări de bine. Păstrează mesajul prietenos și potrivit comunității.";
    default:
      return null;
  }
}
