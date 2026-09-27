import { describe, expect, it } from "vitest";
import { getAntiSpamThresholdError } from "../../lib/anti-spam-validation";

const validDraft: Record<string, any> = {
  antiSpam: {
    message: { thresholds: { messages: 5, windowMs: 5 } },
    edit: { thresholds: { edits: 5, windowMs: 10 } },
    delete: { thresholds: { deletes: 5, windowMs: 10 } },
    mention: { thresholds: { mentions: 5 } },
    emoji: { thresholds: { emoji: 10 } },
  },
};

describe("getAntiSpamThresholdError", () => {
  it("accepts valid thresholds and uses defaults for omitted values", () => {
    expect(getAntiSpamThresholdError(validDraft)).toBeNull();
    expect(getAntiSpamThresholdError({ antiSpam: { message: { thresholds: {} } } })).toBeNull();
  });

  it("rejects values above the server-accepted range", () => {
    const draft = structuredClone(validDraft);
    draft.antiSpam.message.thresholds.messages = 1001;

    expect(getAntiSpamThresholdError(draft)).toContain("Spam de mesaje — Mesaje");
    expect(getAntiSpamThresholdError(draft)).toContain("între 1 și 1000");
  });

  it("rejects fractional values before the save request", () => {
    const draft = structuredClone(validDraft);
    draft.antiSpam.mention.thresholds.mentions = 2.5;

    expect(getAntiSpamThresholdError(draft)).toContain("Spam de mențiuni — Mențiuni");
  });

  it("checks legacy aliases that the editor will normalize on change", () => {
    const draft = structuredClone(validDraft);
    draft.antiSpam.message.thresholds.limit = 0;

    expect(getAntiSpamThresholdError(draft)).toContain("Spam de mesaje — Mesaje");
  });
});