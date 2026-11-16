import { describe, expect, it } from "vitest";
import {
  DEFAULT_AUTO_TRANSLATE, messageImageUrl, messageSourceText, translatesAuthor, TRANSLATE_COMMAND_NAME, buildTranslationEmbed, isTranslatedChannel, looksRomanian, normalizeAutoTranslateConfig,
  parseTranslation, translatableText, translateMessageCommand, worthTranslating,
} from "../auto-translate";

describe("translation into Romanian", () => {
  it("keeps the settings within their limits", () => {
    expect(normalizeAutoTranslateConfig(null)).toEqual(DEFAULT_AUTO_TRANSLATE);
    const config = normalizeAutoTranslateConfig({ enabled: true, channelIds: ["123456789", "123456789", "x"], minLength: 0, hourlyLimit: 99_999, color: "blue" });
    expect(config).toMatchObject({ enabled: true, channelIds: ["123456789"], minLength: 1, hourlyLimit: 2_000, color: DEFAULT_AUTO_TRANSLATE.color });
  });

  it("translates the chosen channels, everything inside the chosen categories, and their threads", () => {
    const config = normalizeAutoTranslateConfig({ enabled: true, channelIds: ["111111111"], categoryIds: ["999999999"] });
    expect(isTranslatedChannel(config, { id: "111111111", parentId: "555555555" })).toBe(true);
    expect(isTranslatedChannel(config, { id: "222222222", parentId: "999999999" })).toBe(true); // a ticket in the applications category
    expect(isTranslatedChannel(config, { id: "333333333", parentId: "555555555" })).toBe(false);
    expect(isTranslatedChannel(config, { id: "thread", parentId: "111111111", isThread: () => true })).toBe(true);
    expect(isTranslatedChannel({ ...config, enabled: false }, { id: "111111111" })).toBe(false);
  });

  it("skips what is already Romanian, too short, or only links, emoji and mentions", () => {
    expect(looksRomanian("Salut, ce faci? Eu sunt bine")).toBe(true);
    expect(looksRomanian("mulțumesc")).toBe(true);
    expect(looksRomanian("Hello, how are you doing today?")).toBe(false);
    expect(worthTranslating("Hello, how are you doing today?", 4)).toBe(true);
    expect(worthTranslating("ok", 4)).toBe(false);
    expect(worthTranslating("<@123456789> https://example.com <:pepe:123456789> 😂", 4)).toBe(false);
    expect(translatableText("hi <@123> look https://x.y `code`")).toBe("hi look");
  });

  it("accepts only a well formed answer from the AI and never lets it ping everyone", () => {
    expect(parseTranslation(JSON.stringify({ language: "engleză", isRomanian: false, translation: "Salut @everyone" }))?.translation).toBe("Salut @​everyone");
    expect(parseTranslation("nu e json")).toBeNull();
    expect(parseTranslation(JSON.stringify({ language: "engleză", translation: "x" }))).toBeNull();
  });

  it("shows the language it came from, and is in the Apps menu", () => {
    const embed = buildTranslationEmbed({ language: "engleză", isRomanian: false, translation: "Bună!" }, "#4f8bd6", { authorName: "Ana" }).toJSON();
    expect(embed.author?.name).toBe("🌐 Tradus din engleză · Ana");
    expect(embed.description).toBe("Bună!");
    expect(translateMessageCommand).toEqual({ name: TRANSLATE_COMMAND_NAME, type: 3 });
    expect(TRANSLATE_COMMAND_NAME.length).toBeLessThanOrEqual(32);
  });

  it("reads announcements: the text and the embeds, from people, bots, apps and followed channels", () => {
    expect(messageSourceText("", [{ title: "Patch 2.1", description: "New map and fixes", fields: [{ name: "When", value: "Friday" }], footer: { text: "Game Studio" } }]))
      .toBe("**Patch 2.1**\nNew map and fixes\n**When**\nFriday\nGame Studio");
    expect(messageSourceText("Big news!", [])).toBe("Big news!");
    const config = DEFAULT_AUTO_TRANSLATE;
    expect(translatesAuthor(config, { id: "111", bot: false }, null, "999")).toBe(true);
    expect(translatesAuthor(config, { id: "222", bot: true }, null, "999")).toBe(true); // another bot or app
    expect(translatesAuthor(config, { id: "333", bot: true }, "333", "999")).toBe(true); // a followed announcement channel
    expect(translatesAuthor(config, { id: "999", bot: true }, null, "999")).toBe(false); // never its own messages
    expect(translatesAuthor({ ...config, includeBots: false }, { id: "222", bot: true }, null, "999")).toBe(false);
  });

  it("keeps the announcement's picture and links to the original when posted elsewhere", () => {
    expect(messageImageUrl([{ image: { url: "https://cdn/x.png" } }], [])).toBe("https://cdn/x.png");
    expect(messageImageUrl([], [{ url: "https://cdn/a.txt", contentType: "text/plain" }, { url: "https://cdn/b.jpg", contentType: "image/jpeg" }])).toBe("https://cdn/b.jpg");
    const embed = buildTranslationEmbed({ language: "engleză", isRomanian: false, translation: "Hartă nouă" }, "#4f8bd6", {
      authorName: "Game News", url: "https://discord.com/channels/1/2/3", imageUrl: "https://cdn/x.png", linkToOriginal: true,
    }).toJSON();
    expect(embed.description).toBe("Hartă nouă\n[↗ Mesajul original](https://discord.com/channels/1/2/3)");
    expect(embed.image?.url).toBe("https://cdn/x.png");
  });
});
