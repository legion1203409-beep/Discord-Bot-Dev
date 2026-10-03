import { describe, expect, it } from "vitest";
import { autoModActionSelection, selectAutoModDeletion, selectAutoModSanction } from "./automod-actions";

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
});