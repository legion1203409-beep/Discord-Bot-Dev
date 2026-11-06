import { describe, expect, it } from "vitest";
import { WELCOME_RUNES, discordServerUrl, drawThree, runeShareText } from "./verification-runes";

describe("runele de bun venit", () => {
  it("draws three different runes", () => {
    for (let round = 0; round < 20; round += 1) {
      const cards = drawThree();
      expect(cards).toHaveLength(3);
      expect(new Set(cards.map((rune) => rune.id)).size).toBe(3);
    }
    expect(new Set(WELCOME_RUNES.map((rune) => rune.id)).size).toBe(WELCOME_RUNES.length);
  });

  it("builds the share text and the server link", () => {
    expect(runeShareText(WELCOME_RUNES[0])).toContain("Purtătorul de Jar");
    expect(discordServerUrl("123456789012345678")).toBe("https://discord.com/channels/123456789012345678");
    expect(discordServerUrl("abc")).toBeNull();
    expect(discordServerUrl(undefined)).toBeNull();
  });
});
