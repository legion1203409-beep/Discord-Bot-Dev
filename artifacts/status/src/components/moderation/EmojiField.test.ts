import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { applyEmojiSelection } from "./emoji-utils";
import { DiscordEmojiText } from "./DiscordEmojiText";

describe("applyEmojiSelection", () => {
  it("inserts Unicode and custom emoji at the current selection", () => {
    expect(applyEmojiSelection("Salut lume", "🔥", 6, 6).value).toBe("Salut 🔥lume");
    expect(applyEmojiSelection("Salut lume", "<:val:12345>", 6, 10).value).toBe("Salut <:val:12345>");
  });

  it("replaces button emoji instead of appending", () => {
    expect(applyEmojiSelection("✅", "<a:dance:12345>", 0, 0, true))
      .toEqual({ value: "<a:dance:12345>", caret: 15 });
  });
});

describe("DiscordEmojiText", () => {
  it("renders custom emoji markup as an image instead of exposing the raw code", () => {
    const html = renderToStaticMarkup(
      createElement(DiscordEmojiText, {
        children: "<:sigiliu_regal:1471891719581732987> Verifică-mă",
      }),
    );

    expect(html).toContain("https://cdn.discordapp.com/emojis/1471891719581732987.png");
    expect(html).toContain("Verifică-mă");
    expect(html).not.toContain("&lt;:sigiliu_regal:");
  });
});