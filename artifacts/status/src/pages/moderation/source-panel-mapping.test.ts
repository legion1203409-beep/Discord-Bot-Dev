import { describe, expect, it } from "vitest";
import { applyPanelChanges, mapPanelSnapshot, type PanelModules } from "./source-panel-mapping";

const defaults: PanelModules = {
  automod: { on: true, f: {}, s: { words: { on: true, f: { list: ["demo"], acts: ["ban"] } } } },
  judecator: { on: false, f: { tone: "bland" }, s: {} },
  general: { on: true, f: { tz: "demo", color: "#000000" } },
  oracol_chat: { on: true, f: { tone: "mistic" } },
};
function config() {
  return {
    autoMod: { enabled: false, forbiddenWords: ["real"], wordFilter: { enabled: false, action: "warn", deleteMessage: true } },
    embeds: { enabled: true, color: "#112233" },
    timeProfiles: { timezone: "Europe/Paris" },
    untouched: { important: true },
  };
}
describe("original panel real configuration mapping", () => {
  it("hydrates supported controls from server values, not document defaults", () => {
    const snapshot = mapPanelSnapshot(defaults, config());
    expect(snapshot.modules.automod!.on).toBe(false);
    expect(snapshot.modules.automod!.s!.words!.f.list).toEqual(["real"]);
    expect(snapshot.modules.automod!.s!.words!.f.acts).toEqual(["sterge", "avert"]);
    expect(snapshot.modules.general!.f.tz).toBe("Europe/Paris");
    expect(snapshot.supported).toContain("automod/words/list");
    expect(snapshot.supported).not.toContain("oracol_chat//tone");
    expect(defaults.automod!.s!.words!.f.list).toEqual(["demo"]);
  });
  it("only changes explicitly requested fields and preserves the current server snapshot", () => {
    const original = config();
    const next = applyPanelChanges(original, [
      { m: "automod", s: "words", k: "list", value: ["updated"] },
      { m: "automod", s: "words", k: "acts", value: ["sterge", "mute"] },
    ]);
    expect(next.autoMod.forbiddenWords).toEqual(["updated"]);
    expect(next.autoMod.wordFilter).toMatchObject({ action: "mute", deleteMessage: true });
    expect(next.untouched).toEqual({ important: true });
    expect(original.autoMod.forbiddenWords).toEqual(["real"]);
  });
  it("rejects unsupported controls and unsupported combined sanctions before mutating anything", () => {
    expect(() => applyPanelChanges(config(), [{ m: "oracol_chat", s: "", k: "tone", value: "scurt" }])).toThrow("nu este conectat");
    expect(() => applyPanelChanges(config(), [{ m: "automod", s: "words", k: "acts", value: ["ban", "avert"] }])).toThrow("singură sancțiune");
    expect(() => applyPanelChanges(config(), [{ m: "automod", s: "words", k: "acts", value: ["alerta"] }])).toThrow("Alerta staff");
  });
  it("resolves only the selected guild's channels and rejects ambiguous names", () => {
    const current = { autoMod: { logChannelId: "123456" } };
    const metadata = { channels: [{ id: "123456", name: "log" }, { id: "234567", name: "other" }] };
    expect(applyPanelChanges(current, [{ m: "automod", s: "", k: "log", value: "other" }], metadata).autoMod.logChannelId).toBe("234567");
    expect(() => applyPanelChanges(current, [{ m: "automod", s: "", k: "log", value: "999999" }], metadata)).toThrow("nu există");
    expect(() => applyPanelChanges(current, [{ m: "automod", s: "", k: "log", value: "log" }], {
      channels: [{ id: "123456", name: "log" }, { id: "234567", name: "log" }],
    })).toThrow("ambiguu");
  });
  it("keeps true Control Bot values readable without autosaving panel publication", () => {
    const snapshot = mapPanelSnapshot({ verificare: { on: false, f: { title: "demo" } } }, {}, {}, {
      verification: { enabled: true, title: "Actual title", channelId: "123456" },
    });
    expect(snapshot.modules.verificare!.f.title).toBe("Actual title");
    expect(snapshot.readable).toContain("verificare//title");
    expect(snapshot.supported).not.toContain("verificare//title");
  });
  it("reads legacy threshold aliases and keeps saved aliases consistent", () => {
    const current = { antiSpam: { message: { thresholds: { limit: 9, seconds: 6 } } } };
    const snapshot = mapPanelSnapshot({ antiflood: { on: false, f: {}, s: { msgs: { on: false, f: {} } } } }, current);
    expect(snapshot.modules.antiflood!.s!.msgs!.f.count).toBe(9);
    expect(snapshot.modules.antiflood!.s!.msgs!.f.secs).toBe(6);
    const updated = applyPanelChanges(current, [{ m: "antiflood", s: "msgs", k: "count", value: 12 }]);
    expect(updated.antiSpam.message.thresholds).toMatchObject({ messages: 12, limit: 12, seconds: 6 });
  });
  it("never adds rule-only deletion fields to suspicious-behavior configuration", () => {
    const updated = applyPanelChanges({ suspiciousBehavior: { action: "none" } }, [{ m: "suspect", s: "", k: "acts", value: ["mute"] }]);
    expect(updated.suspiciousBehavior).toEqual({ action: "mute" });
  });
  it("does not turn permission booleans into the original role-list controls", () => {
    const snapshot = mapPanelSnapshot({ dosare: { on: false, f: { close: [], notes: [] } } }, {
      cases: { enabled: false, allowStaffClose: true, allowStaffNotes: true },
    });
    expect(snapshot.modules.dosare!.f.close).toEqual([]);
    expect(snapshot.modules.dosare!.f.notes).toEqual([]);
    expect(snapshot.supported).not.toContain("dosare//close");
    expect(snapshot.supported).not.toContain("dosare//notes");
  });
});
