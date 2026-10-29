import { describe, expect, it } from "vitest";
import {
  ACTION_ORDER, MODULES, MODULE_BY_ID, actionsText, hasTickedAction, withTickFields, isProtectionRoute, moduleNavSummary, moduleStatus, ruleSummary, thresholdSummary, availableActions, changedSections, deepEqual, describeMuteLength, describeTicks,
  enabledRuleCount, hasOwnSanction, hasUnavailableDelete, isModuleEnabled, lockedActions, moduleForRoute, pausedReason,
  protectionDraftError, readMuteMinutes, readThreshold, readTicks, setAt, setMuteMinutes, staffAlertProblems, thresholdFields,
  toggleTick, writeThreshold, writeTicks, type ActionTicks,
} from "./model";
import { MESSAGE_SPAM } from "../../../lib/anti-spam-validation";

const NONE: ActionTicks = { delete: false, warn: false, mute: false, kick: false, ban: false, alert: false };
const on = (...keys: Array<keyof ActionTicks>): ActionTicks => ({ ...NONE, ...Object.fromEntries(keys.map((key) => [key, true])) });

describe("reading what a rule does as ticks", () => {
  it("reads every rule saved before the extra ticks existed", () => {
    expect(readTicks({ action: "none" }, "message")).toEqual(NONE);
    expect(readTicks({ action: "delete" }, "message")).toEqual(on("delete"));
    expect(readTicks({ action: "warn" }, "message")).toEqual(on("warn"));
    expect(readTicks({ action: "mute", deleteMessage: true }, "message")).toEqual(on("delete", "mute"));
    expect(readTicks({ action: "kick", deleteMessage: false }, "message")).toEqual(on("kick"));
    expect(readTicks({ action: "ban" }, "event")).toEqual(on("ban"));
    expect(readTicks(undefined, "message")).toEqual(NONE);
    expect(readTicks({ action: "something-new" }, "message")).toEqual(NONE);
  });

  it("reads a warning next to a sanction and the staff alert", () => {
    expect(readTicks({ action: "mute", warnMember: true, alertStaff: true, deleteMessage: true }, "message"))
      .toEqual(on("delete", "warn", "mute", "alert"));
    expect(readTicks({ action: "warn", warnMember: true }, "message")).toEqual(on("warn"));
    expect(readTicks({ action: "none", warnMember: true }, "event")).toEqual(on("warn"));
  });

  it("never offers a deletion for a rule that does not react to a message", () => {
    expect(readTicks({ action: "delete" }, "event").delete).toBe(false);
    expect(readTicks({ action: "none", deleteMessage: true }, "event").delete).toBe(false);
    expect(hasUnavailableDelete({ action: "delete" }, "event")).toBe(true);
    expect(hasUnavailableDelete({ action: "delete" }, "message")).toBe(false);
    expect(availableActions("event")).not.toContain("delete");
  });

  it("treats the scam filter as always deleting and without a ban", () => {
    expect(readTicks({ action: "delete" }, "scam")).toEqual(on("delete"));
    expect(readTicks({ action: "mute", warnMember: true }, "scam")).toEqual(on("delete", "warn", "mute"));
    expect(readTicks({ action: "kick" }, "scam")).toEqual(on("delete", "kick"));
    expect(availableActions("scam")).not.toContain("ban");
    expect(lockedActions("scam")).toEqual(["delete"]);
    expect(lockedActions("message")).toEqual([]);
  });
});

describe("what a tick writes into a rule", () => {
  const base = { enabled: true, severity: "hard", thresholds: { emoji: 5 } };

  it("keeps every other field of the rule", () => {
    const next = toggleTick({ ...base, action: "none" }, "mute", true, "message");
    expect(next).toMatchObject({ enabled: true, severity: "hard", thresholds: { emoji: 5 }, action: "mute" });
  });

  it("does not change the rule it was given", () => {
    const rule = { ...base, action: "none" };
    toggleTick(rule, "ban", true, "message");
    expect(rule).toEqual({ ...base, action: "none" });
  });

  it("stores a lone warning as the rule's action", () => {
    expect(toggleTick({ ...base, action: "none", deleteMessage: false }, "warn", true, "message"))
      .toEqual({ ...base, action: "warn", deleteMessage: false });
  });

  it("stores a deletion next to any sanction", () => {
    let rule: any = { ...base, action: "none" };
    rule = toggleTick(rule, "delete", true, "message");
    expect(rule).toMatchObject({ action: "none", deleteMessage: true });
    rule = toggleTick(rule, "warn", true, "message");
    expect(rule).toMatchObject({ action: "warn", deleteMessage: true });
    rule = toggleTick(rule, "mute", true, "message");
    expect(rule).toMatchObject({ action: "mute", deleteMessage: true, warnMember: true });
    expect(readTicks(rule, "message")).toEqual(on("delete", "warn", "mute"));
  });

  it("stores the warning next to a mute, kick or ban as its own flag", () => {
    for (const sanction of ["mute", "kick", "ban"] as const) {
      const rule = toggleTick(toggleTick({ ...base, action: "none" }, "warn", true, "message"), sanction, true, "message");
      expect(rule).toMatchObject({ action: sanction, warnMember: true });
    }
  });

  it("lets only one of mute, kick and ban stay ticked", () => {
    let rule: any = toggleTick({ ...base, action: "none" }, "mute", true, "message");
    rule = toggleTick(rule, "kick", true, "message");
    expect(readTicks(rule, "message")).toEqual(on("kick"));
    rule = toggleTick(rule, "ban", true, "message");
    expect(readTicks(rule, "message")).toEqual(on("ban"));
    rule = toggleTick(rule, "mute", true, "message");
    expect(readTicks(rule, "message")).toEqual(on("mute"));
  });

  it("keeps the warning when the sanction is switched or removed", () => {
    let rule: any = toggleTick(toggleTick({ ...base, action: "none" }, "warn", true, "message"), "mute", true, "message");
    rule = toggleTick(rule, "ban", true, "message");
    expect(rule).toMatchObject({ action: "ban", warnMember: true });
    rule = toggleTick(rule, "ban", false, "message");
    expect(rule).toMatchObject({ action: "warn" });
    expect(rule).not.toHaveProperty("warnMember");
  });

  it("removes the warning flag when the warning is unticked", () => {
    const rule = toggleTick({ ...base, action: "kick", warnMember: true }, "warn", false, "message");
    expect(rule).toMatchObject({ action: "kick" });
    expect(rule).not.toHaveProperty("warnMember");
    expect(toggleTick({ ...base, action: "warn" }, "warn", false, "message")).toMatchObject({ action: "none" });
  });

  it("turns the staff alert on and off without touching the other actions", () => {
    const withAlert = toggleTick({ ...base, action: "mute" }, "alert", true, "message");
    expect(withAlert).toMatchObject({ action: "mute", alertStaff: true });
    const without = toggleTick(withAlert, "alert", false, "message");
    expect(without).toMatchObject({ action: "mute" });
    expect(without).not.toHaveProperty("alertStaff");
  });

  it("converts the old single 'delete' action into the deletion flag on the first change", () => {
    const rule = toggleTick({ ...base, action: "delete" }, "warn", true, "message");
    expect(rule).toMatchObject({ action: "warn", deleteMessage: true });
    expect(toggleTick({ ...base, action: "delete" }, "delete", false, "message")).toMatchObject({ action: "none", deleteMessage: false });
  });

  it("never writes a deletion for an event rule and drops the unavailable one", () => {
    const rule = toggleTick({ ...base, action: "delete" }, "alert", true, "event");
    expect(rule).toMatchObject({ action: "none", alertStaff: true });
    expect(rule).not.toHaveProperty("deleteMessage");
    expect(toggleTick({ ...base, action: "none" }, "delete", true, "event")).toEqual({ ...base, action: "none" });
  });

  it("keeps the scam filter inside the three actions the server accepts", () => {
    const scam = { enabled: true, action: "delete" };
    expect(toggleTick(scam, "mute", true, "scam")).toEqual({ enabled: true, action: "mute" });
    expect(toggleTick(scam, "kick", true, "scam")).toEqual({ enabled: true, action: "kick" });
    expect(toggleTick(scam, "ban", true, "scam")).toEqual(scam);
    expect(toggleTick(scam, "warn", true, "scam")).toEqual({ enabled: true, action: "delete", warnMember: true });
    expect(toggleTick({ enabled: true, action: "mute", warnMember: true }, "mute", false, "scam")).toEqual({ enabled: true, action: "delete", warnMember: true });
    expect(toggleTick(scam, "delete", false, "scam")).toEqual(scam);
    expect(toggleTick(scam, "alert", true, "scam")).toEqual({ enabled: true, action: "delete", alertStaff: true });
  });

  it("ignores ticks a rule does not offer", () => {
    const rule = { enabled: true, action: "none" };
    expect(toggleTick(rule, "mute", true, "event", ["alert"])).toBe(rule);
    expect(toggleTick(rule, "alert", true, "event", ["alert"])).toMatchObject({ alertStaff: true });
  });

  it("round-trips through the saved JSON for every combination of ticks", () => {
    const keys = ["delete", "warn", "mute", "kick", "ban", "alert"] as const;
    for (const kind of ["message", "event", "scam"] as const) {
      const offered = availableActions(kind);
      for (let mask = 0; mask < 1 << keys.length; mask += 1) {
        const ticks = { ...NONE };
        keys.forEach((key, index) => { ticks[key] = Boolean(mask & (1 << index)); });
        const sanctions = ["mute", "kick", "ban"].filter((key) => ticks[key as keyof ActionTicks]).length;
        if (sanctions > 1 || keys.some((key) => ticks[key] && !offered.includes(key))) continue;
        if (kind === "scam" && !ticks.delete) continue;
        const written = JSON.parse(JSON.stringify(writeTicks({ enabled: true }, ticks, kind)));
        expect(readTicks(written, kind)).toEqual(ticks);
        expect(writeTicks(written, readTicks(written, kind), kind)).toEqual(written);
      }
    }
  });
});

describe("the mute length", () => {
  it("defaults to ten minutes and stores what the operator typed", () => {
    expect(readMuteMinutes({ action: "mute" })).toBe(10);
    expect(readMuteMinutes({ action: "mute", muteMinutes: 90 })).toBe(90);
    expect(setMuteMinutes({ action: "mute" }, 90)).toEqual({ action: "mute", muteMinutes: 90 });
    expect(setMuteMinutes({ action: "mute", muteMinutes: 90 }, undefined)).toEqual({ action: "mute" });
  });

  it("is worded in readable Romanian", () => {
    expect(describeMuteLength(1)).toBe("1 minut");
    expect(describeMuteLength(10)).toBe("10 minute");
    expect(describeMuteLength(60)).toBe("1 oră");
    expect(describeMuteLength(120)).toBe("2 ore");
    expect(describeMuteLength(90)).toBe("90 minute");
    expect(describeMuteLength(1_440)).toBe("1 zi");
    expect(describeMuteLength(40_320)).toBe("28 zile");
  });

  it("is part of the summary only when mute is ticked", () => {
    expect(describeTicks({ action: "mute", deleteMessage: true, warnMember: true, alertStaff: true, muteMinutes: 60 }, "message"))
      .toEqual(["Șterge mesajul", "Avertisment", "Mute 1 oră", "Anunță staff-ul"]);
    expect(describeTicks({ action: "kick", muteMinutes: 60 }, "message")).toEqual(["Kick"]);
    expect(describeTicks({ action: "none" }, "message")).toEqual([]);
  });
});

describe("the one-line summary of a rule", () => {
  it("lists the ticked actions or says nothing is done", () => {
    expect(actionsText({ action: "warn", deleteMessage: true }, "message")).toBe("Șterge mesajul + Avertisment");
    expect(actionsText({ action: "none" }, "message")).toBe("Doar înregistrare");
    expect(actionsText({ action: "delete" }, "scam")).toBe("Șterge mesajul");
  });

  it("says a suspicious-behaviour rule follows its module until it picks its own sanction", () => {
    const module = { action: "mute", warnMember: true, muteMinutes: 120 };
    expect(actionsText({ action: "none" }, "event", { moduleDefaults: module })).toBe("Ca modulul: Avertisment + Mute 2 ore");
    expect(actionsText({ action: "kick" }, "event", { moduleDefaults: module })).toBe("Kick");
    expect(actionsText({ action: "none" }, "event", { moduleDefaults: { action: "none" } })).toBe("Doar înregistrare");
    expect(actionsText({ action: "none", alertStaff: true }, "event", { moduleDefaults: { action: "none" } })).toBe("Ca modulul: Anunță staff-ul");
    expect(actionsText({ action: "ban" }, "event", { moduleDefaults: { action: "none", alertStaff: true } })).toBe("Ban + Anunță staff-ul");
    expect(actionsText({ action: "mute", muteMinutes: 30 }, "event", { moduleDefaults: { action: "kick", muteMinutes: 600 } })).toBe("Mute 30 minute");
    expect(hasOwnSanction({ action: "none", warnMember: true })).toBe(true);
    expect(hasOwnSanction({ action: "none", alertStaff: true })).toBe(false);
  });

  it("shows only the alert for the flow of joins and leaves", () => {
    expect(actionsText({ action: "none" }, "event", { only: ["alert"], moduleDefaults: { action: "ban", alertStaff: true } })).toBe("Ca modulul: Anunță staff-ul");
    expect(actionsText({ action: "none" }, "event", { only: ["alert"], moduleDefaults: { action: "ban" } })).toBe("Doar înregistrare");
  });
});

describe("values of a rule", () => {
  it("reads and writes a threshold through the preferred key and drops the legacy aliases", () => {
    const [messages, window] = thresholdFields(MESSAGE_SPAM);
    const rule = { thresholds: { windowMs: 5, window: 9, limit: 3 } };
    expect(readThreshold(rule, window!)).toBe(5);
    expect(readThreshold(rule, messages!)).toBe(3);
    expect(writeThreshold(rule, window!, 12).thresholds).toEqual({ windowMs: 12, limit: 3 });
    expect(writeThreshold(rule, messages!, 8).thresholds).toEqual({ windowMs: 5, window: 9, messages: 8 });
    expect(writeThreshold(rule, window!, undefined).thresholds).toEqual({ limit: 3 });
    expect(readThreshold({}, window!)).toBeUndefined();
  });

  it("updates nested values without touching the original", () => {
    const source = { a: { b: { c: 1 } }, list: [1, 2] };
    const next = setAt(source, ["a", "b", "c"], 2);
    expect(next).toEqual({ a: { b: { c: 2 } }, list: [1, 2] });
    expect(source.a.b.c).toBe(1);
    expect(setAt({}, ["x", "y"], 1)).toEqual({ x: { y: 1 } });
    expect(setAt({}, ["x", 0], 1)).toEqual({ x: [1] });
  });

  it("compares configurations by content, not by key order", () => {
    expect(deepEqual({ a: 1, b: { c: [1, 2] } }, { b: { c: [1, 2] }, a: 1 })).toBe(true);
    expect(deepEqual({ a: 1 }, { a: 2 })).toBe(false);
    expect(deepEqual({ a: 1, b: undefined }, { a: 1 })).toBe(true);
    expect(deepEqual([1, 2], [2, 1])).toBe(false);
    expect(deepEqual({ a: [] }, { a: {} })).toBe(false);
  });
});

describe("modules", () => {
  const config = {
    protection: { enabled: true },
    autoMod: { enabled: true, wordFilter: { enabled: true }, linkBlock: { enabled: false }, scamFilter: { enabled: true }, emojiLimit: {}, capsLimit: {}, repeatBlock: {} },
    antiRaid: { enabled: false, rule: { enabled: false } },
  };

  it("opens the module of a route and the first one by default", () => {
    expect(moduleForRoute("/anti-raid").id).toBe("antiraid");
    expect(moduleForRoute("/comportament-suspect/").id).toBe("suspect");
    expect(moduleForRoute("/protectie").id).toBe("automod");
    expect(moduleForRoute("/anti-spam?x=1").id).toBe("antispam");
    expect(new Set(MODULES.map((module) => module.route)).size).toBe(MODULES.length);
  });

  it("counts the modules and rules that are on", () => {
    expect(isModuleEnabled(config, MODULES[0]!)).toBe(true);
    expect(isModuleEnabled(config, MODULES[3]!)).toBe(false);
    expect(enabledRuleCount(config, MODULES[0]!)).toBe(2);
  });

  it("explains a module that is on while the whole protection is off", () => {
    expect(pausedReason({ ...config, protection: { enabled: false } }, MODULES[0]!)).toMatch(/oprită/);
    expect(pausedReason({ ...config, protection: { enabled: false } }, MODULES[3]!)).toBeNull();
    expect(pausedReason(config, MODULES[0]!)).toBeNull();
  });

  it("gives every rule a unique id and a place in the configuration", () => {
    const ids = MODULES.flatMap((module) => module.rules.map((rule) => `${module.id}.${rule.id}`));
    expect(new Set(ids).size).toBe(ids.length);
    for (const module of MODULES) for (const rule of module.rules) expect(rule.path[0]).toBe(module.configKey);
    expect(MODULES.flatMap((module) => module.rules).length).toBe(6 + 5 + 4 + 1 + 6);
  });

  it("sends only the sections that changed", () => {
    const saved = { protection: { enabled: true }, autoMod: { enabled: false, forbiddenWords: [] }, antiRaid: { enabled: false } };
    expect(changedSections(saved, structuredClone(saved))).toEqual([]);
    const edited = setAt(saved, ["autoMod", "forbiddenWords"], ["x"]);
    expect(changedSections(saved, edited).map((section) => section.key)).toEqual(["autoMod"]);
    const both = setAt(setAt(saved, ["antiRaid", "enabled"], true), ["protection", "enabled"], false);
    expect(changedSections(saved, both).map((section) => section.key)).toEqual(["protection.enabled", "antiRaid"]);
    expect(changedSections(null, saved)).toEqual([]);
  });
});

describe("checks before saving", () => {
  const valid = () => ({
    autoMod: { emojiLimit: { thresholds: { emoji: 5 } } },
    antiSpam: { message: { thresholds: { messages: 5, windowMs: 5 } } },
    antiRaid: { joinsPerMinute: 10, accountAgeDays: 7, rule: { thresholds: { joins: 10, windowSeconds: 60 } } },
    suspiciousBehavior: { massEdits: { thresholds: { changes: 5 } } },
  });

  it("accepts a configuration whose numbers are all in range", () => {
    expect(protectionDraftError(valid())).toBeNull();
    expect(protectionDraftError({})).toBeNull();
  });

  it("names the rule and the field of a number that is out of range", () => {
    const spam = setAt(valid(), ["antiSpam", "message", "thresholds", "messages"], 0);
    expect(protectionDraftError(spam)).toBe("Spam de mesaje — Mesaje: introdu un număr întreg între 1 și 1000.");
    const emoji = setAt(valid(), ["autoMod", "emojiLimit", "thresholds", "emoji"], 2.5);
    expect(protectionDraftError(emoji)).toMatch(/^Limită emoji — Emoji/);
    const raid = setAt(valid(), ["antiRaid", "joinsPerMinute"], 20_000);
    expect(protectionDraftError(raid)).toBe("Anti-raid — Intrări pe minut: introdu un număr întreg între 1 și 10000.");
  });

  it("refuses a mute length Discord would not accept", () => {
    for (const bad of [0, -5, 40_321, 1.5]) {
      const rule = setAt(valid(), ["autoMod", "wordFilter"], { muteMinutes: bad });
      expect(protectionDraftError(rule)).toMatch(/Filtru cuvinte — Durata mute-ului/);
    }
    expect(protectionDraftError(setAt(valid(), ["autoMod", "wordFilter"], { muteMinutes: 40_320 }))).toBeNull();
    expect(protectionDraftError(setAt(valid(), ["suspiciousBehavior", "muteMinutes"], 0))).toMatch(/Comportament suspect/);
  });
});

describe("notes next to the staff alert", () => {
  it("asks for a channel and for staff roles when either is missing", () => {
    expect(staffAlertProblems({ permissions: { staffRoleIds: ["1"] } }, "123")).toEqual([]);
    expect(staffAlertProblems({ permissions: { staffRoleIds: ["1"] } }, null)).toHaveLength(1);
    expect(staffAlertProblems({ permissions: { staffRoleIds: [] } }, "123")).toHaveLength(1);
    expect(staffAlertProblems({}, "")).toHaveLength(2);
    // Without a module channel the bot posts in the audit channel, when the audit log is on.
    expect(staffAlertProblems({ permissions: { staffRoleIds: ["1"] }, audit: { enabled: true, channelId: "9" } }, null)).toEqual([]);
    expect(staffAlertProblems({ permissions: { staffRoleIds: ["1"] }, audit: { enabled: false, channelId: "9" } }, null)).toHaveLength(1);
  });

  it("keeps the order in which actions are always listed", () => {
    expect(ACTION_ORDER).toEqual(["delete", "warn", "mute", "kick", "ban", "alert"]);
  });
});

describe("the menu and the lines under each title", () => {
  it("knows which routes belong to the protection page", () => {
    for (const route of ["/protectie", "/automod", "/anti-spam/", "/anti-flood?x=1", "/anti-raid", "/comportament-suspect"]) {
      expect(isProtectionRoute(route)).toBe(true);
    }
    for (const route of ["/", "/ai", "/config", "/protectie-x", "/automodx"]) expect(isProtectionRoute(route)).toBe(false);
  });

  it("tells apart a module that runs, one paused by the global switch and one that is off", () => {
    const automod = MODULE_BY_ID.automod;
    const config = { protection: { enabled: true }, autoMod: { enabled: true, wordFilter: { enabled: true }, linkBlock: { enabled: true } } };
    expect(moduleStatus(config, automod)).toBe("on");
    expect(moduleNavSummary(config, automod)).toBe("2 din 6 reguli pornite");
    expect(moduleStatus({ ...config, protection: { enabled: false } }, automod)).toBe("paused");
    expect(moduleNavSummary({ ...config, protection: { enabled: false } }, automod)).toBe("Pornit, dar protecția e oprită");
    expect(moduleStatus({ autoMod: { enabled: false } }, automod)).toBe("off");
    expect(moduleNavSummary({ autoMod: { enabled: false } }, automod)).toBe("Oprit");
    expect(moduleNavSummary({ antiRaid: { enabled: true, rule: { enabled: true } } }, MODULE_BY_ID.antiraid)).toBe("Pornit, regula e activă");
    expect(moduleNavSummary({ antiRaid: { enabled: true, rule: { enabled: false } } }, MODULE_BY_ID.antiraid)).toBe("Pornit, regula e oprită");
  });

  it("sums up the thresholds of a rule in a few words, whichever key they were saved under", () => {
    const spam = MODULE_BY_ID.antispam.rules.find((rule) => rule.id === "message")!;
    expect(thresholdSummary(spam, { thresholds: { messages: 5, windowMs: 5 } })).toBe("5 mesaje · 5 s");
    expect(thresholdSummary(spam, { thresholds: { limit: 7, window: 9 } })).toBe("7 mesaje · 9 s");
    const edits = MODULE_BY_ID.antispam.rules.find((rule) => rule.id === "edit")!;
    expect(thresholdSummary(edits, { thresholds: { limit: 5, windowMs: 10 } })).toBe("5 editări · 10 s");
    const words = MODULE_BY_ID.automod.rules.find((rule) => rule.id === "wordFilter")!;
    expect(thresholdSummary(words, { thresholds: {} })).toBe("");
  });

  it("says a rule is off, or lists its thresholds and actions", () => {
    const spam = MODULE_BY_ID.antispam.rules.find((rule) => rule.id === "message")!;
    expect(ruleSummary(spam, { enabled: false, action: "mute" })).toBe("Oprită");
    expect(ruleSummary(spam, { enabled: true, action: "mute", deleteMessage: true, muteMinutes: 60, thresholds: { messages: 5, windowMs: 5 } }))
      .toBe("5 mesaje · 5 s · Șterge mesajul + Mute 1 oră");
    const words = MODULE_BY_ID.automod.rules.find((rule) => rule.id === "wordFilter")!;
    expect(ruleSummary(words, { enabled: true, action: "none" })).toBe("Doar înregistrare");
    const nick = MODULE_BY_ID.suspect.rules.find((rule) => rule.id === "nicknameChanges")!;
    expect(ruleSummary(nick, { enabled: true, action: "none", thresholds: { limit: 5 } }, { action: "kick" })).toBe("5 evenimente · Ca modulul: Kick");
  });

  it("checks only the sections that are about to be saved", () => {
    const broken = { antiSpam: { message: { thresholds: { messages: 0 } } }, antiRaid: { joinsPerMinute: 0 } };
    expect(protectionDraftError(broken)).toMatch(/Spam de mesaje/);
    expect(protectionDraftError(broken, ["autoMod"])).toBeNull();
    expect(protectionDraftError(broken, ["antiRaid"])).toMatch(/Anti-raid — Intrări pe minut/);
    expect(protectionDraftError({ suspiciousBehavior: { muteMinutes: 0 } }, ["protection.enabled"])).toBeNull();
  });
});

describe("applying ticks onto the newest state", () => {
  it("copies only what the ticks decide and keeps everything else", () => {
    const newest = { enabled: true, severity: "hard", thresholds: { limit: 3 }, action: "none", warnMember: true, nicknameChanges: { enabled: true } };
    const ticked = { enabled: false, severity: "soft", action: "mute", muteMinutes: 30, alertStaff: true };
    expect(withTickFields(newest, ticked)).toEqual({
      enabled: true, severity: "hard", thresholds: { limit: 3 }, nicknameChanges: { enabled: true }, action: "mute", muteMinutes: 30, alertStaff: true,
    });
  });

  it("tells whether anything at all is ticked", () => {
    expect(hasTickedAction({ action: "none" }, "message")).toBe(false);
    expect(hasTickedAction({ action: "none", deleteMessage: true }, "message")).toBe(true);
    expect(hasTickedAction({ action: "none", alertStaff: true }, "event")).toBe(true);
    expect(hasTickedAction({ action: "delete" }, "scam")).toBe(true);
    expect(hasTickedAction({ action: "kick" }, "event", ["alert"])).toBe(false);
  });
});
