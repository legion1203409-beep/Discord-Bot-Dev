import { describe, expect, it } from "vitest";
import { configSaveToastOptions, protectionToggleToastOptions } from "./protection-toggle-feedback";

describe("Discord moderation activation feedback", () => {
  it("does not claim full Discord synchronization when the bot is offline", () => {
    const notice = protectionToggleToastOptions(true, "sent", undefined, "bot_offline");
    expect(notice.title).toContain("incompletă");
    expect(notice.description).toContain("botul este deconectat");
  });

  it("distinguishes a persisted config from a missing Discord permission", () => {
    const notice = configSaveToastOptions("not_applicable", "Setări salvate", "Profil actualizat.", "missing_permission");
    expect(notice.title).toContain("salvate");
    expect(notice.description).toContain("Manage Server");
  });

  it("warns when an existing administrator rule blocks a managed native rule", () => {
    const notice = protectionToggleToastOptions(true, "not_applicable", undefined, "conflict");
    expect(notice.title).toContain("incompletă");
    expect(notice.description).toContain("administrată manual");
  });

  it("keeps normal success feedback when native rules are synchronized", () => {
    expect(protectionToggleToastOptions(true, "sent", undefined, "synced").title).toBe("Modul activat");
    expect(configSaveToastOptions("not_applicable", "Setări salvate", "Profil actualizat.", "synced"))
      .toEqual({ title: "Setări salvate", description: "Profil actualizat." });
  });
});