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
});