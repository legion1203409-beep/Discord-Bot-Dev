import { describe, expect, it } from "vitest";
import { buildAutomaticModerationLogDescription } from "../automod-logging";

describe("automatic moderation log message content", () => {
  it("includes a safe, readable excerpt when deletion succeeded", () => {
    const description = buildAutomaticModerationLogDescription(
      "AutoMod",
      "Cuvânt interzis",
      "123456789",
      "987654321",
      { deletedContent: "Salut @everyone, cod `ascuns`" },
    );

    expect(description).toContain("Mesaj șters de AutoMod");
    expect(description).toContain("Salut @\u200beveryone, cod ˋascunsˋ");
    expect(description).not.toContain("@everyone");
    expect(description).toContain("Utilizator: <@123456789>");
  });

  it("does not include message text when deletion failed", () => {
    const description = buildAutomaticModerationLogDescription(
      "AutoMod",
      "Cuvânt interzis",
      "123456789",
      "987654321",
      { deletionFailed: true },
    );

    expect(description).toContain("nu a putut fi șters");
    expect(description).not.toContain("Mesaj șters de AutoMod");
    expect(description).not.toContain("conținut textual");
  });

  it("bounds long excerpts and preserves Unicode characters", () => {
    const description = buildAutomaticModerationLogDescription(
      "AutoMod",
      "Cuvânt interzis",
      "123456789",
      "987654321",
      { deletedContent: "😀".repeat(1_000) },
    );

    expect(description.length).toBeLessThanOrEqual(900);
    expect(description).toContain("trunchiat");
    expect(description).toContain("😀");
    expect(description).not.toMatch(/[\uD800-\uDBFF]$/);
  });

  it("leaves ordinary automatic logs unchanged when no deletion is reported", () => {
    expect(buildAutomaticModerationLogDescription(
      "AutoMod",
      "Cuvânt interzis",
      "123456789",
      "987654321",
    )).toBe("Cuvânt interzis • Utilizator: <@123456789> • Canal: <#987654321>");
  });

  it("organizes a scam alert with the AI finding, original message, image link and OCR text", () => {
    const description = buildAutomaticModerationLogDescription(
      "Semnalare AI",
      "Promisiune suspectă de recompensă",
      "123456789",
      "987654321",
      {
        detailed: true,
        source: "Moderare AI",
        category: "Scam / fraudă · încredere 97%",
        messageContent: "Ai câștigat bani! @everyone",
        attachments: [{ name: "dovada.png", url: "https://cdn.discordapp.com/attachments/test/dovada.png" }],
        extractedText: "Retragere reușită · revendică bonusul",
        actionSummary: "Acțiune configurată: avertisment",
      },
    );

    expect(description.indexOf("**Sursă:**")).toBeLessThan(description.indexOf("**Detectare:**"));
    expect(description).toContain("**Categorie AI:** Scam / fraudă · încredere 97%");
    expect(description).toContain("**Utilizator:** <@123456789>");
    expect(description).toContain("**Canal:** <#987654321>");
    expect(description).toContain("Ai câștigat bani! @\u200beveryone");
    expect(description).toContain("[dovada.png](https://cdn.discordapp.com/attachments/test/dovada.png)");
    expect(description).toContain("**Text detectat în imagine:**");
    expect(description).toContain("Acțiune configurată: avertisment");
    expect(description).not.toContain("@everyone");
  });

  it("shows normal AutoMod details even when the message was not deleted", () => {
    const description = buildAutomaticModerationLogDescription(
      "AutoMod",
      "Link suspect",
      "123456789",
      "987654321",
      {
        detailed: true,
        source: "AutoMod",
        category: "link",
        messageContent: "https://example.test/promo",
        actionSummary: "Acțiune configurată: doar înregistrare",
      },
    );

    expect(description).toContain("**Sursă:** AutoMod");
    expect(description).toContain("**Detectare:** Link suspect");
    expect(description).toContain("https://example.test/promo");
    expect(description).toContain("Acțiune configurată: doar înregistrare");
  });
});