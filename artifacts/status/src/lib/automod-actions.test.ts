import { describe, expect, it } from "vitest";
import { aiCategoryActions, autoModActionSelection, inheritsAiCategoryActions, selectAutoModDeletion, selectAutoModSanction, setAiCategoryActions, toggleAutoModAction } from "./automod-actions";

describe("AutoMod combined action selection", () => {
  it.each(["warn", "mute", "kick", "ban"])("can save deletion together with %s", (action) => {
    const rule = { enabled: true, action: "none", severity: "hard", thresholds: { emoji: 5 } };
    const selected = selectAutoModSanction(selectAutoModDeletion(rule, true), action);
    const reloaded = JSON.parse(JSON.stringify(selected));
    expect(autoModActionSelection(reloaded)).toEqual({ sanction: action, deleteMessage: true });
    expect(selected).toMatchObject({ enabled: true, severity: "hard", thresholds: { emoji: 5 } });
    expect(rule.action).toBe("none");
    expect(rule).not.toHaveProperty("deleteMessage");
  });

  it("lets deletion be enabled and disabled without changing the sanction", () => {
    const rule = { action: "kick", deleteMessage: true };
    expect(selectAutoModDeletion(rule, false)).toEqual({ action: "kick", deleteMessage: false });
    expect(selectAutoModSanction(rule, "mute")).toEqual({ action: "mute", deleteMessage: true });
  });

  it("preserves old delete-only settings when adding a sanction", () => {
    const rule = { action: "delete", deleteMessage: false };
    expect(autoModActionSelection(rule)).toEqual({ sanction: "none", deleteMessage: true });
    expect(selectAutoModSanction(rule, "kick")).toEqual({ action: "kick", deleteMessage: true });
    expect(selectAutoModDeletion(rule, false)).toEqual({ action: "none", deleteMessage: false });
  });

  it("supports deletion without a member sanction and sanction without deletion", () => {
    expect(selectAutoModDeletion({ action: "none" }, true)).toEqual({ action: "none", deleteMessage: true });
    expect(selectAutoModSanction({ action: "none" }, "mute")).toEqual({ action: "mute", deleteMessage: false });
  });

  it.each(["warn", "mute", "kick", "ban"])("lets operators check deletion plus %s in either order", (sanction) => {
    const firstDelete = toggleAutoModAction(toggleAutoModAction({ action: "none" }, "delete", true), sanction, true);
    const firstSanction = toggleAutoModAction(toggleAutoModAction({ action: "none" }, sanction, true), "delete", true);
    expect(firstDelete).toEqual({ action: sanction, deleteMessage: true });
    expect(firstSanction).toEqual(firstDelete);
    expect(toggleAutoModAction(firstDelete, sanction, false)).toEqual({ action: "none", deleteMessage: true });
    expect(toggleAutoModAction(firstDelete, "delete", false)).toEqual({ action: sanction, deleteMessage: false });
  });

  it("replaces a member sanction without dropping deletion or selecting conflicting sanctions", () => {
    expect(toggleAutoModAction({ action: "warn", deleteMessage: true }, "mute", true))
      .toEqual({ action: "mute", deleteMessage: true });
  });

  it("inherits AI actions until the category is customized, retaining sensitivity and other categories", () => {
    const ai = { action: "mute", deleteMessage: true, categorySettings: {
      threats: { sensitivity: "high" }, scams: { action: "kick", deleteMessage: true },
    } };
    expect(inheritsAiCategoryActions(ai, "threats")).toBe(true);
    expect(aiCategoryActions(ai, "threats")).toEqual({ action: "mute", deleteMessage: true });
    const custom = setAiCategoryActions(ai, "threats", { action: "warn", deleteMessage: false });
    expect(inheritsAiCategoryActions(custom, "threats")).toBe(false);
    expect(aiCategoryActions(custom, "threats")).toEqual({ action: "warn", deleteMessage: false });
    expect(custom.categorySettings.threats).toEqual({ sensitivity: "high", action: "warn", deleteMessage: false });
    expect(custom.categorySettings.scams).toEqual(ai.categorySettings.scams);
    expect(ai.categorySettings.threats).toEqual({ sensitivity: "high" });
    const restored = setAiCategoryActions(custom, "threats", undefined);
    expect(inheritsAiCategoryActions(restored, "threats")).toBe(true);
    expect(aiCategoryActions(restored, "threats")).toEqual({ action: "mute", deleteMessage: true });
    expect(restored.categorySettings.threats).toEqual({ sensitivity: "high" });
  });

  it("lets an AI category disable deletion or enable deletion-only independently of defaults", () => {
    const ai = { action: "mute", deleteMessage: true };
    const warningOnly = setAiCategoryActions(ai, "toxicity", { action: "warn", deleteMessage: false });
    expect(aiCategoryActions(warningOnly, "toxicity")).toEqual({ action: "warn", deleteMessage: false });
    const deletionOnly = setAiCategoryActions(ai, "toxicity", { action: "none", deleteMessage: true });
    expect(aiCategoryActions(deletionOnly, "toxicity")).toEqual({ action: "none", deleteMessage: true });
  });

  it("freezes both choices when inheritance is turned off even if old general settings omit deletion", () => {
    const ai = { action: "warn" };
    const custom = setAiCategoryActions(ai, "threats", aiCategoryActions(ai, "threats"));
    expect(aiCategoryActions({ ...custom, deleteMessage: true }, "threats"))
      .toEqual({ action: "warn", deleteMessage: false });
  });
});